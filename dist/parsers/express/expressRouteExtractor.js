"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpressRouteExtractor = void 0;
const path = __importStar(require("node:path"));
const ts_morph_1 = require("ts-morph");
const astUtils_1 = require("../../utils/astUtils");
const HTTP_METHODS = new Set([
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options"
]);
/** Extracts route declarations and router mounts. It does not inspect handler bodies. */
class ExpressRouteExtractor {
    extract(sourceFiles) {
        const routers = this.collectRouters(sourceFiles);
        this.linkAliasesAndImports(sourceFiles, routers);
        const routes = [];
        const relations = [];
        const diagnostics = [];
        for (const sourceFile of sourceFiles) {
            sourceFile.forEachDescendant((node) => {
                if (!ts_morph_1.Node.isCallExpression(node))
                    return;
                const expression = node.getExpression();
                if (!ts_morph_1.Node.isPropertyAccessExpression(expression))
                    return;
                const name = expression.getName().toLowerCase();
                const routeBuilder = this.routeBuilderTarget(expression.getExpression(), sourceFile, routers);
                if (routeBuilder && HTTP_METHODS.has(name)) {
                    routes.push({
                        routerKey: routeBuilder.routerKey,
                        method: name,
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
                    if (HTTP_METHODS.has(name) &&
                        ts_morph_1.Node.isIdentifier(expression.getExpression()) &&
                        /^(app|router|api)$/i.test(expression.getExpression().getText())) {
                        diagnostics.push({
                            severity: "warning",
                            message: "HTTP-like Express call was skipped because its app/router instance could not be resolved statically.",
                            filePath: sourceFile.getFilePath(),
                            line: node.getStartLineNumber(),
                            source: "HappyDocs"
                        });
                    }
                    return;
                }
                if (HTTP_METHODS.has(name)) {
                    const [pathArgument, ...args] = node.getArguments();
                    const evaluated = (0, astUtils_1.evaluateString)(pathArgument);
                    routes.push({
                        routerKey: owner,
                        method: name,
                        path: evaluated.value,
                        pathExpression: evaluated.expression,
                        args,
                        call: node,
                        confidence: evaluated.resolved ? "high" : "low",
                        unresolvedItems: evaluated.resolved
                            ? []
                            : [`Dynamic route expression: ${evaluated.expression}`]
                    });
                }
                else if (name === "use") {
                    const [first, ...remaining] = node.getArguments();
                    const firstString = (0, astUtils_1.evaluateString)(first);
                    const hasPrefix = firstString.resolved ||
                        ts_morph_1.Node.isBinaryExpression(first) ||
                        ts_morph_1.Node.isIdentifier(first) ||
                        ts_morph_1.Node.isTemplateExpression(first);
                    const childArg = hasPrefix
                        ? remaining.find((argument) => ts_morph_1.Node.isIdentifier(argument))
                        : [first, ...remaining].find((argument) => ts_morph_1.Node.isIdentifier(argument));
                    const child = childArg && ts_morph_1.Node.isIdentifier(childArg)
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
                    }
                    else if (remaining.some((argument) => ts_morph_1.Node.isIdentifier(argument))) {
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
    collectRouters(sourceFiles) {
        const routers = new Map();
        for (const sourceFile of sourceFiles) {
            for (const declaration of sourceFile.getVariableDeclarations()) {
                const initializer = declaration.getInitializer();
                if (!initializer || !ts_morph_1.Node.isCallExpression(initializer))
                    continue;
                const kind = routerFactoryKind(initializer);
                if (!kind)
                    continue;
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
    linkAliasesAndImports(sourceFiles, routers) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const sourceFile of sourceFiles) {
                for (const declaration of sourceFile.getVariableDeclarations()) {
                    const initializer = declaration.getInitializer();
                    if (!initializer || !ts_morph_1.Node.isIdentifier(initializer))
                        continue;
                    const sourceKey = identifierRouterKey(initializer, sourceFile, routers);
                    const targetKey = routerKey(sourceFile, declaration.getName());
                    if (sourceKey && !routers.has(targetKey)) {
                        const source = routers.get(sourceKey);
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
                    const moduleFile = resolveModuleSource(importDeclaration.getModuleSpecifierValue(), sourceFile, sourceFiles);
                    if (!moduleFile)
                        continue;
                    const aliases = [];
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
                            const source = routers.get(exported);
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
    routeBuilderTarget(expression, sourceFile, routers) {
        if (!ts_morph_1.Node.isCallExpression(expression))
            return undefined;
        const callee = expression.getExpression();
        if (!ts_morph_1.Node.isPropertyAccessExpression(callee) || callee.getName() !== "route")
            return undefined;
        const owner = identifierRouterKey(callee.getExpression(), sourceFile, routers);
        if (!owner)
            return undefined;
        return { routerKey: owner, path: (0, astUtils_1.evaluateString)(expression.getArguments()[0]) };
    }
}
exports.ExpressRouteExtractor = ExpressRouteExtractor;
function routerFactoryKind(call) {
    const expression = call.getExpression();
    if (ts_morph_1.Node.isIdentifier(expression) && expression.getText() === "Router")
        return "router";
    if (ts_morph_1.Node.isIdentifier(expression) && expression.getText() === "express")
        return "app";
    if (ts_morph_1.Node.isPropertyAccessExpression(expression) && expression.getName() === "Router")
        return "router";
    return undefined;
}
function routerKey(sourceFile, name) {
    return `${sourceFile.getFilePath()}::${name}`;
}
function identifierRouterKey(expression, sourceFile, routers) {
    if (!ts_morph_1.Node.isIdentifier(expression))
        return undefined;
    const localKey = routerKey(sourceFile, expression.getText());
    return routers.get(localKey)?.canonicalKey;
}
function resolveModuleSource(moduleSpecifier, sourceFile, allFiles) {
    if (!moduleSpecifier.startsWith("."))
        return undefined;
    const base = path.resolve(path.dirname(sourceFile.getFilePath()), moduleSpecifier);
    return allFiles.find((file) => {
        const candidate = file.getFilePath();
        return (candidate === base ||
            candidate.replace(/\.(tsx?|jsx?)$/, "") === base ||
            candidate.replace(/\/index\.(tsx?|jsx?)$/, "") === base);
    });
}
function defaultExportName(sourceFile) {
    const assignment = sourceFile.getExportAssignment((item) => !item.isExportEquals());
    return assignment && ts_morph_1.Node.isIdentifier(assignment.getExpression())
        ? assignment.getExpression().getText()
        : undefined;
}
function exportedRouterKey(sourceFile, exportName, routers) {
    const direct = routerKey(sourceFile, exportName);
    if (routers.has(direct))
        return direct;
    const declarations = sourceFile.getExportDeclarations();
    for (const declaration of declarations) {
        for (const specifier of declaration.getNamedExports()) {
            if ((specifier.getAliasNode()?.getText() ?? specifier.getName()) === exportName) {
                const candidate = routerKey(sourceFile, specifier.getName());
                if (routers.has(candidate))
                    return candidate;
            }
        }
    }
    return undefined;
}
//# sourceMappingURL=expressRouteExtractor.js.map