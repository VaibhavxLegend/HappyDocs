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

export interface FastifyDescriptor {
  key: string;
  canonicalKey: string;
  filePath: string;
  name: string;
  kind: "app" | "plugin";
}

export interface FastifyRelation {
  parentKey: string;
  childKey: string;
  prefix?: string;
  prefixExpression: string;
  confidence: Confidence;
}

export interface FastifyRouteCandidate {
  routerKey: string;
  method: HttpMethod;
  path?: string;
  pathExpression: string;
  args: Node[];
  call: CallExpression;
  confidence: Confidence;
  unresolvedItems: string[];
}

export interface FastifyRouteExtraction {
  routers: Map<string, FastifyDescriptor>;
  routes: FastifyRouteCandidate[];
  relations: FastifyRelation[];
  diagnostics: ScanDiagnostic[];
}

/** Extracts route declarations and plugin registrations for Fastify. */
export class FastifyRouteExtractor {
  extract(sourceFiles: SourceFile[]): FastifyRouteExtraction {
    const routers = this.collectRouters(sourceFiles);
    this.linkAliasesAndImports(sourceFiles, routers);
    const routes: FastifyRouteCandidate[] = [];
    const relations: FastifyRelation[] = [];
    const diagnostics: ScanDiagnostic[] = [];

    for (const sourceFile of sourceFiles) {
      sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;
        const expression = node.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) return;
        const name = expression.getName().toLowerCase();

        const owner = identifierRouterKey(expression.getExpression(), sourceFile, routers);
        if (!owner) {
          if (
            HTTP_METHODS.has(name as HttpMethod) &&
            Node.isIdentifier(expression.getExpression()) &&
            /^(app|fastify|api)$/i.test(expression.getExpression().getText())
          ) {
            diagnostics.push({
              severity: "warning",
              message: "HTTP-like Fastify call was skipped because its instance could not be resolved statically.",
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
        } else if (name === "route") {
          const [optionsArg] = node.getArguments();
          if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) {
            diagnostics.push({
              severity: "info",
              message: "Fastify .route() call must use an object literal for static extraction.",
              filePath: sourceFile.getFilePath(),
              line: node.getStartLineNumber(),
              source: "HappyDocs"
            });
            return;
          }
          const methodProp = optionsArg.getProperties().find(p => p.getName() === "method");
          const urlProp = optionsArg.getProperties().find(p => p.getName() === "url");
          if (!methodProp || !urlProp) {
            diagnostics.push({
              severity: "info",
              message: "Fastify .route() missing method or url property.",
              filePath: sourceFile.getFilePath(),
              line: node.getStartLineNumber(),
              source: "HappyDocs"
            });
            return;
          }
          const method = evaluateString(methodProp.getInitializer()!).value.toLowerCase() as HttpMethod;
          const url = evaluateString(urlProp.getInitializer()!);
          routes.push({
            routerKey: owner,
            method,
            path: url.value,
            pathExpression: url.expression,
            args: [optionsArg],
            call: node,
            confidence: url.resolved ? "high" : "low",
            unresolvedItems: url.resolved
              ? []
              : [`Dynamic route expression: ${url.expression}`]
          });
        } else if (name === "register") {
          const [pluginArg, optionsArg] = node.getArguments();
          if (!pluginArg || !Node.isIdentifier(pluginArg)) return;

          const pluginName = pluginArg.getText();
          let child = identifierRouterKey(pluginArg, sourceFile, routers);
          if (!child) {
            const key = routerKey(sourceFile, pluginName);
            const descriptor: FastifyDescriptor = {
              key,
              canonicalKey: key,
              filePath: sourceFile.getFilePath(),
              name: pluginName,
              kind: "plugin"
            };
            routers.set(key, descriptor);
            child = key;
          }

          let prefixValue = "";
          let prefixExpr = '""';
          let confidence: Confidence = "high";

          if (optionsArg && Node.isObjectLiteralExpression(optionsArg)) {
            const prefixProp = optionsArg.getProperties().find(p => p.getName() === "prefix");
            if (prefixProp) {
              const evaluated = evaluateString(prefixProp.getInitializer());
              prefixValue = evaluated.value || "";
              prefixExpr = evaluated.expression;
              confidence = evaluated.resolved ? "high" : "low";
            }
          }
          relations.push({
            parentKey: owner,
            childKey: child,
            prefix: prefixValue,
            prefixExpression: prefixExpr,
            confidence
          });
        }
      });
    }
    return { routers, routes, relations, diagnostics };
  }

  private collectRouters(sourceFiles: SourceFile[]): Map<string, FastifyDescriptor> {
    const routers = new Map<string, FastifyDescriptor>();
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
    routers: Map<string, FastifyDescriptor>
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
    routers: Map<string, FastifyDescriptor>
  ): { routerKey: string; path: ReturnType<typeof evaluateString> } | undefined {
    if (!Node.isCallExpression(expression)) return undefined;
    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "route") return undefined;
    const owner = identifierRouterKey(callee.getExpression(), sourceFile, routers);
    if (!owner) return undefined;
    return { routerKey: owner, path: evaluateString(expression.getArguments()[0]) };
  }
}

function routerFactoryKind(call: CallExpression): "app" | "plugin" | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression) && expression.getText() === "fastify") return "app";
  if (Node.isPropertyAccessExpression(expression) && expression.getName() === "fastify")
    return "app";
  if (Node.isCallExpression(expression)) {
    const callee = expression.getExpression();
    if (Node.isIdentifier(callee) && callee.getText() === "require") {
      const arg = expression.getArguments()[0];
      if (arg && evaluateString(arg).value === "fastify") return "app";
    }
  }
  return undefined;
}

function routerKey(sourceFile: SourceFile, name: string): string {
  return `${sourceFile.getFilePath()}::${name}`;
}

function identifierRouterKey(
  expression: Node,
  sourceFile: SourceFile,
  routers: Map<string, FastifyDescriptor>
): string | undefined {
  if (!Node.isIdentifier(expression)) return undefined;
  const name = expression.getText();

  // Check if it's a parameter of the containing function
  let current = expression.getParent();
  while (current) {
    if (
      (Node.isFunctionDeclaration(current) ||
       Node.isArrowFunction(current) ||
       Node.isFunctionExpression(current)) &&
      current.getParameters().some(p => p.getName() === name)
    ) {
      const decl = sourceFile.getVariableDeclarations().find(d => {
        const init = d.getInitializer();
        return init && init === current;
      });
      const virtualKey = decl
        ? `${sourceFile.getFilePath()}::var-${decl.getStart()}`
        : `${sourceFile.getFilePath()}::func-${current.getStart()}`;

      if (!routers.has(virtualKey)) {
        routers.set(virtualKey, {
          key: virtualKey,
          canonicalKey: virtualKey,
          filePath: sourceFile.getFilePath(),
          name: name,
          kind: "plugin"
        });
      }
      return virtualKey;
    }
    current = current.getParent();
  }

  const localKey = routerKey(sourceFile, name);
  if (routers.has(localKey)) return routers.get(localKey)!.canonicalKey;

  // Check if it's a function definition in the same file
  const declaration = sourceFile.getVariableDeclarations().find(d => d.getName() === name);
  if (declaration) {
    const initializer = declaration.getInitializer();
    if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
      const funcKey = `${sourceFile.getFilePath()}::var-${declaration.getStart()}`;
      if (!routers.has(funcKey)) {
        routers.set(funcKey, {
          key: funcKey,
          canonicalKey: funcKey,
          filePath: sourceFile.getFilePath(),
          name: name,
          kind: "plugin"
        });
      }
      return funcKey;
    }
  }

  return undefined;
}
