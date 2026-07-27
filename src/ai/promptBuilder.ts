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
  return `You are an expert technical writer specializing in API documentation. Your goal is to transform raw AST-extracted metadata and source code into a professional, developer-friendly API guide.

Return ONLY a valid JSON object with the following optional fields:
- summary: A concise, action-oriented summary (e.g., "Retrieve a user by ID").
- description: A detailed explanation of what the endpoint does, including any side effects or requirements.
- parameterDescriptions: A map of parameter names to their descriptions.
- requestExample: A realistic JSON object for the request body.
- responseExamples: A map of status codes to realistic JSON response examples.
- warnings: Any uncertainties or gaps where the evidence is contradictory or missing.

Guidelines:
1. Accuracy First: Do not invent fields, status codes, or behavior. If the source is ambiguous, note it in "warnings".
2. Developer Centric: Use professional terminology. Focus on the "what" and "why".
3. Conciseness: Keep summaries under 120 characters.
4. Constraints: parameterDescriptions keys must exactly match the metadata keys. Examples must strictly adhere to the provided schemas.

Example Transformation:
Input Metadata: { "method": "get", "path": "/users/:id", "parameters": [{ "name": "id", "location": "path" }] }
Input Source: "const getUser = (req, res) => { // Fetch user from DB \\n const user = await db.find(req.params.id); res.json(user); }"
Output JSON: {
  "summary": "Get User Details",
  "description": "Retrieves detailed profile information for a specific user by their unique identifier.",
  "parameterDescriptions": { "id": "The unique UUID of the user." },
  "responseExamples": { "200": { "id": "usr_123", "name": "Jane Doe", "email": "jane@example.com" } }
}

Normalized endpoint metadata:
${JSON.stringify(metadata, null, 2)}

Relevant source snippet (may be absent or partial):
${sourceSnippet ? sourceSnippet.slice(0, 6000) : "No source snippet supplied."}`;
}
