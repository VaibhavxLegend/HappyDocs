import type { ApiEndpoint } from "./types";

export function deduplicateEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
  const result = new Map<string, ApiEndpoint>();
  for (const endpoint of endpoints) {
    const key = `${endpoint.method}:${endpoint.fullPath}`;
    const current = result.get(key);
    if (!current) {
      result.set(key, endpoint);
      continue;
    }
    result.set(key, {
      ...current,
      tags: [...new Set([...current.tags, ...endpoint.tags])],
      middleware: [...new Set([...current.middleware, ...endpoint.middleware])],
      parameters: mergeBy(
        current.parameters,
        endpoint.parameters,
        (parameter) => `${parameter.location}:${parameter.name}`
      ),
      responses: mergeBy(current.responses, endpoint.responses, (response) => response.statusCode),
      unresolvedItems: [...new Set([...current.unresolvedItems, ...endpoint.unresolvedItems])],
      confidence: lowestConfidence(current.confidence, endpoint.confidence)
    });
  }
  return [...result.values()];
}

function mergeBy<T>(first: T[], second: T[], key: (item: T) => string): T[] {
  return [...new Map([...first, ...second].map((item) => [key(item), item])).values()];
}

function lowestConfidence(
  first: ApiEndpoint["confidence"],
  second: ApiEndpoint["confidence"]
): ApiEndpoint["confidence"] {
  const ranking = { high: 3, medium: 2, low: 1 };
  return ranking[first] <= ranking[second] ? first : second;
}
