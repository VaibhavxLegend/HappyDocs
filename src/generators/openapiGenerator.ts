import YAML from "yaml";
import type { ApiEndpoint, ApiSchema, HappyDocsConfig } from "../core/types";
import { openApiPath } from "../utils/pathUtils";

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components?: { securitySchemes?: Record<string, unknown> };
}

export function generateOpenApi(
  endpoints: ApiEndpoint[],
  config: HappyDocsConfig
): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  let hasBearerAuth = false;
  for (const endpoint of endpoints) {
    const path = openApiPath(endpoint.fullPath);
    const operation: Record<string, unknown> = {
      operationId: endpoint.id.replace(/[^A-Za-z0-9_]/g, "_"),
      tags: endpoint.tags,
      summary: endpoint.summary,
      description: endpoint.description,
      parameters: endpoint.parameters.map((parameter) => ({
        name: parameter.name,
        in: parameter.location,
        required: parameter.location === "path" ? true : parameter.required,
        description: parameter.description,
        schema: parameter.schema ?? schemaForParameter(parameter.type),
        example: parameter.example
      })),
      responses: Object.fromEntries(
        endpoint.responses.map((response) => [
          response.statusCode,
          {
            description: response.description,
            ...(response.contentType
              ? {
                  content: {
                    [response.contentType]: {
                      ...(response.schema ? { schema: response.schema } : {}),
                      ...(response.example !== undefined ? { example: response.example } : {})
                    }
                  }
                }
              : {})
          }
        ])
      ),
      "x-source-location": endpoint.source,
      "x-happydocs-confidence": endpoint.confidence,
      ...(endpoint.unresolvedItems.length
        ? { "x-happydocs-unresolved": endpoint.unresolvedItems }
        : {}),
      ...(endpoint.aiEnrichment?.accepted ? { "x-happydocs-ai-assisted": true } : {})
    };
    if (endpoint.requestBody) {
      operation.requestBody = {
        required: endpoint.requestBody.required,
        description: endpoint.requestBody.description,
        content: {
          [endpoint.requestBody.contentType]: {
            schema: endpoint.requestBody.schema,
            ...(endpoint.requestBody.example !== undefined
              ? { example: endpoint.requestBody.example }
              : {})
          }
        }
      };
    }
    if (endpoint.authentication) {
      hasBearerAuth ||= endpoint.authentication.type === "bearer";
      operation.security = [{ bearerAuth: [] }];
    }
    paths[path] ??= {};
    paths[path][endpoint.method] = removeUndefined(operation) as Record<string, unknown>;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: config.apiTitle,
      version: config.apiVersion,
      description: config.apiDescription
    },
    ...(config.baseUrl ? { servers: [{ url: config.baseUrl }] } : {}),
    paths,
    ...(hasBearerAuth
      ? {
          components: {
            securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
          }
        }
      : {})
  };
}

export function serializeOpenApi(document: OpenApiDocument, format: "yaml" | "json"): string {
  return format === "json"
    ? `${JSON.stringify(document, null, 2)}\n`
    : YAML.stringify(document, { sortMapEntries: true });
}

function schemaForParameter(type: string): ApiSchema {
  if (/boolean/i.test(type)) return { type: "boolean" };
  if (/number|int/i.test(type)) return { type: "number" };
  return { type: "string" };
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}
