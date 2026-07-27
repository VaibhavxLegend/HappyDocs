"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpressParser = void 0;
const pathUtils_1 = require("../../utils/pathUtils");
const expressMetadataResolver_1 = require("./expressMetadataResolver");
const expressRouteExtractor_1 = require("./expressRouteExtractor");
class ExpressParser {
    framework = "express";
    parse(context) {
        const extraction = new expressRouteExtractor_1.ExpressRouteExtractor().extract(context.sourceFiles);
        const resolver = new expressMetadataResolver_1.ExpressMetadataResolver();
        const endpoints = [];
        for (const route of extraction.routes) {
            const metadata = resolver.resolve(route);
            const prefixes = resolvePrefixes(route.routerKey, extraction.relations);
            for (const prefix of prefixes) {
                const fullPath = (0, pathUtils_1.normalizeRoutePath)(prefix.path, route.path ?? route.pathExpression);
                const confidence = minConfidence(route.confidence, prefix.confidence);
                endpoints.push({
                    id: `express:${route.call.getSourceFile().getFilePath()}:${route.call.getStart()}:${prefix.path}`,
                    framework: "express",
                    method: route.method,
                    path: route.path ?? route.pathExpression,
                    fullPath,
                    summary: metadata.summary,
                    description: metadata.description,
                    tags: [(0, pathUtils_1.tagFromPath)(prefix.path || route.path || "")],
                    source: metadata.source,
                    parameters: metadata.parameters,
                    requestBody: metadata.requestBody,
                    responses: metadata.responses,
                    authentication: metadata.middleware.some((item) => /auth|guard|jwt/i.test(item))
                        ? { type: "bearer", description: "Inferred from Express middleware" }
                        : undefined,
                    middleware: metadata.middleware,
                    confidence,
                    unresolvedItems: [
                        ...route.unresolvedItems,
                        ...prefix.unresolvedItems,
                        ...metadata.unresolvedItems
                    ]
                });
            }
        }
        return { endpoints, diagnostics: extraction.diagnostics };
    }
}
exports.ExpressParser = ExpressParser;
function resolvePrefixes(routerKey, relations, visited = new Set()) {
    if (visited.has(routerKey))
        return [
            { path: "", confidence: "low", unresolvedItems: ["Circular router registration detected."] }
        ];
    const parents = relations.filter((relation) => relation.childKey === routerKey);
    if (!parents.length)
        return [{ path: "", confidence: "high", unresolvedItems: [] }];
    const nextVisited = new Set(visited).add(routerKey);
    return parents.flatMap((parent) => resolvePrefixes(parent.parentKey, relations, nextVisited).map((prefix) => ({
        path: (0, pathUtils_1.normalizeRoutePath)(prefix.path, parent.prefix ?? parent.prefixExpression),
        confidence: minConfidence(prefix.confidence, parent.confidence),
        unresolvedItems: [
            ...prefix.unresolvedItems,
            ...(parent.prefix === undefined
                ? [`Dynamic router prefix: ${parent.prefixExpression}`]
                : [])
        ]
    })));
}
function minConfidence(first, second) {
    const ranks = { high: 3, medium: 2, low: 1 };
    return ranks[first] <= ranks[second] ? first : second;
}
//# sourceMappingURL=expressParser.js.map