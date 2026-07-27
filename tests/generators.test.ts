import { describe, expect, it } from "vitest";
import { deduplicateEndpoints } from "../src/core/endpointDeduplicator";
import type { ApiEndpoint } from "../src/core/types";
import { generateMarkdown } from "../src/generators/markdownGenerator";
import { generateOpenApi, serializeOpenApi } from "../src/generators/openapiGenerator";
import { testConfig } from "./helpers";

const endpoint: ApiEndpoint = {
  id: "express:1",
  framework: "express",
  method: "get",
  path: "/users/:id",
  fullPath: "/users/:id",
  summary: "Get user",
  tags: ["Users"],
  source: { filePath: "/workspace/src/users.ts", line: 10, column: 1 },
  parameters: [
    { name: "id", location: "path", type: "string", required: true, schema: { type: "string" } }
  ],
  responses: [
    {
      statusCode: "200",
      description: "Success",
      contentType: "application/json",
      schema: { type: "object" }
    }
  ],
  middleware: [],
  confidence: "high",
  unresolvedItems: []
};

describe("documentation generators", () => {
  it("generates OpenAPI 3.1 with source extensions", () => {
    const document = generateOpenApi([endpoint], testConfig);
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/users/{id}"].get["x-source-location"]).toEqual(endpoint.source);
    expect(serializeOpenApi(document, "yaml")).toContain("openapi: 3.1.0");
  });

  it("generates readable Markdown with a documentation gaps section", () => {
    const markdown = generateMarkdown(
      [{ ...endpoint, unresolvedItems: ["Dynamic response type"] }],
      testConfig,
      "/workspace"
    );
    expect(markdown).toContain("## Documentation gaps");
    expect(markdown).toContain("GET /users/:id");
    expect(markdown).toContain("Dynamic response type");
  });

  it("merges duplicate endpoint metadata deterministically", () => {
    const duplicates = deduplicateEndpoints([
      endpoint,
      { ...endpoint, id: "nestjs:2", tags: ["Admin"], middleware: ["auth"], confidence: "medium" }
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      tags: ["Users", "Admin"],
      middleware: ["auth"],
      confidence: "medium"
    });
  });
});
