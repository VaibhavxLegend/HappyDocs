import type { ApiEndpoint } from "../core/types";

export function buildEnrichmentPrompt(endpoint: ApiEndpoint, sourceSnippet?: string): string {
  const metadata = {
    method: endpoint.method,
    path: endpoint.fullPath,
    tags: endpoint.tags,
    parameters: endpoint.parameters,
    requestBody: endpoint.requestBody,
    responses: endpoint.responses,
    middleware: endpoint.middleware,
    unresolvedItems: endpoint.unresolvedItems
  };
  return `You improve API documentation from evidence. Return only valid JSON with optional fields summary, description, parameterDescriptions, requestExample, responseExamples, warnings.

Rules:
- Do not invent fields, status codes, authorization schemes, or behavior.
- When information is incomplete, put a concise uncertainty in warnings instead of guessing.
- Keep summary under 120 characters and descriptions factual.
- parameterDescriptions keys must exactly match parameter names in the metadata.
- Examples may use only fields that are present in the supplied schema or source.

Normalized endpoint metadata:
${JSON.stringify(metadata, null, 2)}

Relevant source snippet (may be absent or partial):
${sourceSnippet ? sourceSnippet.slice(0, 6000) : "No source snippet supplied."}`;
}
