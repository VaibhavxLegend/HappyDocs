import * as path from "node:path";
import { Node, type CallExpression, type SourceFile } from "ts-morph";
import { evaluateString } from "../../utils/astUtils";
import type { Confidence, HttpMethod, ScanDiagnostic } from "../../core/types";

const HTTP_METHODS = new Set<HttpMethod>([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options"
]);

export interface RouterDescriptor {
  key: string;
  canonicalKey: string;
  filePath: string;
  name: string;
  kind: "app" | "router";
}

export interface RouterRelation {
  parentKey: string;
  childKey: string;
  prefix?: string;
  prefixExpression: string;
  confidence: Confidence;
}

export interface ExpressRouteCandidate {
  routerKey: string;
  method: HttpMethod;
  path?: string;
  pathExpression: string;
  args: Node[];
  call: CallExpression;
  confidence: Confidence;
  unresolvedItems: string[];
}

export interface ExpressRouteExtraction {
  routers: Map<string, RouterDescriptor>;
  routes: ExpressRouteCandidate[];
  relations: RouterRelation[];
  diagnostics: ScanDiagnostic[];
}

/** Extracts route declarations and router mounts. It does not inspect handler bodies. */
export class ExpressRouteExtractor {
  extract(sourceFiles: SourceFile[]): ExpressRouteExtraction {
    const routers = this.collectRouters(sourceFiles);
    this.linkAliasesAndImports(sourceFiles, routers);
    const routes: ExpressRouteCandidate[] = [];
    const relations: RouterRelation[] = [];
    const diagnostics: ScanDiagnostic[] = [];

    for (const sourceFile of sourceFiles) {
      sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;
        const expression = node.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) return;
        const name = expression.getName().toLowerCase();

        const routeBuilder = this.routeBuilderTarget(
          expression.getExpression(),
          sourceFile,
          routers
        );
        if (routeBuilder && HTTP_METHODS.has(name as HttpMethod)) {
          routes.push({
            routerKey: routeBuilder.routerKey,
            method: name as HttpMethod,
            path: routeBuilder.path.value,
            pathExpression: routeBuilder.path.expression,
            args: node.getArguments(),
            call: node,
            confidence: routeBuilder.path.resolved ? "high" : "low",
            unresolvedItems: routeBuilder.path.resolved
              ? []
              : [`Dynamic route expression: ${routeBuilder.path.expression}`]
          });
          return;
        }

        const owner = identifierRouterKey(expression.getExpression(), sourceFile, routers);
        if (!owner) {
          if (
            HTTP_METHODS.has(name as HttpMethod) &&
            Node.isIdentifier(expression.getExpression()) &&
            /^(app|router|api)$/i.test(expression.getExpression().getText())
          ) {
            diagnostics.push({
              severity: "warning",
              message:
                "HTTP-like Express call was skipped because its app/router instance could not be resolved statically.",
              filePath: sourceFile.getFilePath(),
              line: node.getStartLineNumber(),
              source: "HappyDocs"
            });
          }
          return;
        }
        if (HTTP_METHODS.has(name as HttpMethod)) {
          const [pathArgument, ...args] = node.getArguments();
          const evaluated = evaluateString(pathArgument);
          routes.push({
            routerKey: owner,
            method: name as HttpMethod,
            path: evaluated.value,
            pathExpression: evaluated.expression,
            args,
            call: node,
            confidence: evaluated.resolved ? "high" : "low",
            unresolvedItems: evaluated.resolved
              ? []
              : [`Dynamic route expression: ${evaluated.expression}`]
          });
        } else if (name === "use") {
          const [first, ...remaining] = node.getArguments();
          const firstString = evaluateString(first);
          const hasPrefix =
            firstString.resolved ||
            Node.isBinaryExpression(first) ||
            Node.isIdentifier(first) ||
            Node.isTemplateExpression(first);
          const childArg = hasPrefix
            ? remaining.find((argument) => Node.isIdentifier(argument))
            : [first, ...remaining].find((argument) => Node.isIdentifier(argument));
          const child =
            childArg && Node.isIdentifier(childArg)
              ? identifierRouterKey(childArg, sourceFile, routers)
              : undefined;
          if (child) {
            const prefix = hasPrefix
              ? firstString
              : { value: "", expression: '""', resolved: true };
            relations.push({
              parentKey: owner,
              childKey: child,
              prefix: prefix.value,
              prefixExpression: prefix.expression,
              confidence: prefix.resolved ? "high" : "low"
            });
          } else if (remaining.some((argument) => Node.isIdentifier(argument))) {
            diagnostics.push({
              severity: "info",
              message: "Express router mount could not be resolved statically.",
              filePath: sourceFile.getFilePath(),
              line: node.getStartLineNumber(),
              source: "HappyDocs"
            });
          }
        }
      });
    }
    return { routers, routes, relations, diagnostics };
  }

  private collectRouters(sourceFiles: SourceFile[]): Map<string, RouterDescriptor> {
    const routers = new Map<string, RouterDescriptor>();
    for (const sourceFile of sourceFiles) {
      for (const declaration of sourceFile.getVariableDeclarations()) {
        const initializer = declaration.getInitializer();
        if (!initializer || !Node.isCallExpression(initializer)) continue;
        const kind = routerFactoryKind(initializer);
        if (!kind) continue;
        const name = declaration.getName();
        const key = routerKey(sourceFile, name);
        routers.set(key, {
          key,
          canonicalKey: key,
          filePath: sourceFile.getFilePath(),
          name,
          kind
        });
      }
    }
    return routers;
  }

  private linkAliasesAndImports(
    sourceFiles: SourceFile[],
    routers: Map<string, RouterDescriptor>
  ): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const sourceFile of sourceFiles) {
        for (const declaration of sourceFile.getVariableDeclarations()) {
          const initializer = declaration.getInitializer();
          if (!initializer || !Node.isIdentifier(initializer)) continue;
          const sourceKey = identifierRouterKey(initializer, sourceFile, routers);
          const targetKey = routerKey(sourceFile, declaration.getName());
          if (sourceKey && !routers.has(targetKey)) {
            const source = routers.get(sourceKey)!;
            routers.set(targetKey, {
              ...source,
              key: targetKey,
              filePath: sourceFile.getFilePath(),
              name: declaration.getName()
            });
            changed = true;
          }
        }
        for (const importDeclaration of sourceFile.getImportDeclarations()) {
          const moduleFile = resolveModuleSource(
            importDeclaration.getModuleSpecifierValue(),
            sourceFile,
            sourceFiles
          );
          if (!moduleFile) continue;
          const aliases: Array<[string, string]> = [];
          const defaultImport = importDeclaration.getDefaultImport();
          if (defaultImport)
            aliases.push([defaultImport.getText(), defaultExportName(moduleFile) ?? "default"]);
          for (const specifier of importDeclaration.getNamedImports())
            aliases.push([
              specifier.getAliasNode()?.getText() ?? specifier.getName(),
              specifier.getName()
            ]);
          for (const [localName, exportedName] of aliases) {
            const exported = exportedRouterKey(moduleFile, exportedName, routers);
            const local = routerKey(sourceFile, localName);
            if (exported && !routers.has(local)) {
              const source = routers.get(exported)!;
              routers.set(local, {
                ...source,
                key: local,
                filePath: sourceFile.getFilePath(),
                name: localName
              });
              changed = true;
            }
          }
        }
      }
    }
  }

  private routeBuilderTarget(
    expression: Node,
    sourceFile: SourceFile,
    routers: Map<string, RouterDescriptor>
  ): { routerKey: string; path: ReturnType<typeof evaluateString> } | undefined {
    if (!Node.isCallExpression(expression)) return undefined;
    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "route") return undefined;
    const owner = identifierRouterKey(callee.getExpression(), sourceFile, routers);
    if (!owner) return undefined;
    return { routerKey: owner, path: evaluateString(expression.getArguments()[0]) };
  }
}

function routerFactoryKind(call: CallExpression): "app" | "router" | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression) && expression.getText() === "Router") return "router";
  if (Node.isIdentifier(expression) && expression.getText() === "express") return "app";
  if (Node.isPropertyAccessExpression(expression) && expression.getName() === "Router")
    return "router";
  return undefined;
}

function routerKey(sourceFile: SourceFile, name: string): string {
  return `${sourceFile.getFilePath()}::${name}`;
}

function identifierRouterKey(
  expression: Node,
  sourceFile: SourceFile,
  routers: Map<string, RouterDescriptor>
): string | undefined {
  if (!Node.isIdentifier(expression)) return undefined;
  const localKey = routerKey(sourceFile, expression.getText());
  return routers.get(localKey)?.canonicalKey;
}

function resolveModuleSource(
  moduleSpecifier: string,
  sourceFile: SourceFile,
  allFiles: SourceFile[]
): SourceFile | undefined {
  if (!moduleSpecifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(sourceFile.getFilePath()), moduleSpecifier);
  return allFiles.find((file) => {
    const candidate = file.getFilePath();
    return (
      candidate === base ||
      candidate.replace(/\.(tsx?|jsx?)$/, "") === base ||
      candidate.replace(/\/index\.(tsx?|jsx?)$/, "") === base
    );
  });
}

function defaultExportName(sourceFile: SourceFile): string | undefined {
  const assignment = sourceFile.getExportAssignment((item) => !item.isExportEquals());
  return assignment && Node.isIdentifier(assignment.getExpression())
    ? assignment.getExpression().getText()
    : undefined;
}

function exportedRouterKey(
  sourceFile: SourceFile,
  exportName: string,
  routers: Map<string, RouterDescriptor>
): string | undefined {
  const direct = routerKey(sourceFile, exportName);
  if (routers.has(direct)) return direct;
  const declarations = sourceFile.getExportDeclarations();
  for (const declaration of declarations) {
    for (const specifier of declaration.getNamedExports()) {
      if ((specifier.getAliasNode()?.getText() ?? specifier.getName()) === exportName) {
        const candidate = routerKey(sourceFile, specifier.getName());
        if (routers.has(candidate)) return candidate;
      }
    }
  }
  return undefined;
}
