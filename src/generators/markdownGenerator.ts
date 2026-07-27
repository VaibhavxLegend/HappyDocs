import type { ApiEndpoint, ApiSchema, HappyDocsConfig } from "../core/types";
import { relativeTo } from "../utils/pathUtils";

export function generateMarkdown(
  endpoints: ApiEndpoint[],
  config: HappyDocsConfig,
  workspaceRoot?: string
): string {
  const groups = groupByTag(endpoints);
  const authEndpoints = endpoints.filter((endpoint) => endpoint.authentication);
  const gaps = endpoints.flatMap((endpoint) =>
    endpoint.unresolvedItems.map((item) => ({ endpoint, item }))
  );
  const lines = [
    `# ${config.apiTitle}`,
    "",
    config.apiDescription,
    "",
    "## Overview",
    "",
    `- Version: \`${config.apiVersion}\``,
    `- Base URL: \`${config.baseUrl}\``,
    `- Generated endpoints: **${endpoints.length}**`,
    "",
    "## Authentication",
    "",
    authEndpoints.length
      ? "Some endpoints require bearer authentication, inferred from middleware or guards."
      : "No authentication middleware or guards were detected.",
    "",
    "## Table of contents",
    "",
    ...[...groups.keys()].map((tag) => `- [${tag}](#${anchor(tag)})`),
    ""
  ];

  for (const [tag, taggedEndpoints] of groups) {
    lines.push(`## ${tag}`, "");
    for (const endpoint of taggedEndpoints) appendEndpoint(lines, endpoint, workspaceRoot);
  }
  lines.push("## Documentation gaps", "");
  if (!gaps.length) lines.push("No unresolved route metadata was detected.");
  else {
    for (const { endpoint, item } of gaps)
      lines.push(`- \`${endpoint.method.toUpperCase()} ${endpoint.fullPath}\`: ${item}`);
  }
  return `${lines.join("\n")}\n`;
}

function appendEndpoint(lines: string[], endpoint: ApiEndpoint, workspaceRoot?: string): void {
  lines.push(`### ${endpoint.method.toUpperCase()} ${endpoint.fullPath}`, "");
  if (endpoint.summary) lines.push(endpoint.summary, "");
  if (endpoint.description && endpoint.description !== endpoint.summary)
    lines.push(endpoint.description, "");
  if (endpoint.aiEnrichment?.accepted)
    lines.push(
      "> AI-assisted text and examples are marked as suggestions accepted by the user.",
      ""
    );
  lines.push(`- Confidence: **${endpoint.confidence}**`);
  lines.push(
    `- Source: \`${workspaceRoot ? relativeTo(workspaceRoot, endpoint.source.filePath) : endpoint.source.filePath}:${endpoint.source.line}:${endpoint.source.column}\``
  );
  if (endpoint.middleware.length)
    lines.push(`- Middleware: ${endpoint.middleware.map((item) => `\`${item}\``).join(", ")}`);
  lines.push("");
  if (endpoint.parameters.length) {
    lines.push(
      "#### Parameters",
      "",
      "| Name | In | Type | Required | Description |",
      "| --- | --- | --- | --- | --- |"
    );
    for (const parameter of endpoint.parameters)
      lines.push(
        `| \`${parameter.name}\` | ${parameter.location} | ${parameter.type} | ${parameter.required ? "Yes" : "No"} | ${parameter.description ?? ""} |`
      );
    lines.push("");
  }
  if (endpoint.requestBody) {
    lines.push(
      "#### Request body",
      "",
      `Content type: \`${endpoint.requestBody.contentType}\``,
      "",
      "```json",
      JSON.stringify(
        endpoint.requestBody.example ?? exampleForSchema(endpoint.requestBody.schema),
        null,
        2
      ),
      "```",
      ""
    );
  }
  lines.push("#### Responses", "");
  for (const response of endpoint.responses) {
    lines.push(`- **${response.statusCode}** — ${response.description}`);
    if (response.schema || response.example !== undefined)
      lines.push(
        "",
        "```json",
        JSON.stringify(response.example ?? exampleForSchema(response.schema), null, 2),
        "```"
      );
  }
  if (endpoint.unresolvedItems.length)
    lines.push("", `> Warning: ${endpoint.unresolvedItems.join(" ")}`);
  lines.push("");
}

function groupByTag(endpoints: ApiEndpoint[]): Map<string, ApiEndpoint[]> {
  const groups = new Map<string, ApiEndpoint[]>();
  for (const endpoint of endpoints) {
    const tag = endpoint.tags[0] ?? "Default";
    groups.set(tag, [...(groups.get(tag) ?? []), endpoint]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function anchor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function exampleForSchema(schema: ApiSchema | undefined): unknown {
  if (!schema) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "array") return [exampleForSchema(schema.items)];
  if (schema.type === "object" || schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [key, exampleForSchema(value)])
    );
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.type === "boolean") return false;
  return "string";
}
