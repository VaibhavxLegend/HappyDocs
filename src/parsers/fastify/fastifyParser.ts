import type { ApiEndpoint, ParserContext, ParserResult } from "../../core/types";
import { normalizeRoutePath, tagFromPath } from "../../utils/pathUtils";
import type { BaseParser } from "../baseParser";
import { FastifyMetadataResolver } from "./fastifyMetadataResolver";
import { FastifyRouteExtractor, type FastifyRelation } from "./fastifyRouteExtractor";

export class FastifyParser implements BaseParser {
  readonly framework = "fastify" as const;

  parse(context: ParserContext): ParserResult {
    const extraction = new FastifyRouteExtractor().extract(context.sourceFiles);
    const resolver = new FastifyMetadataResolver();
    const endpoints: ApiEndpoint[] = [];
    for (const route of extraction.routes) {
      const metadata = resolver.resolve(route, context);
      const prefixes = resolvePrefixes(route.routerKey, extraction.relations);
      console.log(`Route ${route.method} ${route.path} routerKey: ${route.routerKey}, prefixes:`, prefixes);
      for (const prefix of prefixes) {
        const fullPath = normalizeRoutePath(prefix.path, route.path ?? route.pathExpression);
        const confidence = minConfidence(route.confidence, prefix.confidence);
        endpoints.push({
          id: `fastify:${route.call.getSourceFile().getFilePath()}:${route.call.getStart()}:${prefix.path}`,
          framework: "fastify",
          method: route.method,
          path: route.path ?? route.pathExpression,
          fullPath,
          summary: metadata.summary,
          description: metadata.description,
          tags: [tagFromPath(prefix.path || route.path || "")],
          source: metadata.source,
          parameters: metadata.parameters,
          requestBody: metadata.requestBody,
          responses: metadata.responses,
          authentication: metadata.middleware.some((item) => /auth|guard|jwt/i.test(item))
            ? { type: "bearer", description: "Inferred from Fastify middleware" }
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

function resolvePrefixes(
  routerKey: string,
  relations: FastifyRelation[],
  visited = new Set<string>()
): Array<{ path: string; confidence: ApiEndpoint["confidence"]; unresolvedItems: string[] }> {
  if (visited.has(routerKey))
    return [
      { path: "", confidence: "low", unresolvedItems: ["Circular plugin registration detected."] }
    ];
  const parents = relations.filter((relation) => relation.childKey === routerKey);
  if (!parents.length) return [{ path: "", confidence: "high", unresolvedItems: [] }];
  const nextVisited = new Set(visited).add(routerKey);
  return parents.flatMap((parent) =>
    resolvePrefixes(parent.parentKey, relations, nextVisited).map((prefix) => ({
      path: normalizeRoutePath(prefix.path, parent.prefix ?? parent.prefixExpression),
      confidence: minConfidence(prefix.confidence, parent.confidence),
      unresolvedItems: [
        ...prefix.unresolvedItems,
        ...(parent.prefix === undefined
          ? [`Dynamic plugin prefix: ${parent.prefixExpression}`]
          : [])
      ]
    }))
  );
}

function minConfidence(
  first: ApiEndpoint["confidence"],
  second: ApiEndpoint["confidence"]
): ApiEndpoint["confidence"] {
  const ranks = { high: 3, medium: 2, low: 1 };
  return ranks[first] <= ranks[second] ? first : second;
}
