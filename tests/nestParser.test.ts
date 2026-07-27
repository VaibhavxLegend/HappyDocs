import { describe, expect, it } from "vitest";
import { NestControllerParser } from "../src/parsers/nestjs/nestControllerParser";
import { fixture, inMemoryProject } from "./helpers";

describe("NestControllerParser", () => {
  it("extracts controller decorators, parameters, guards and Swagger metadata", () => {
    const result = new NestControllerParser().parse(
      inMemoryProject({ "/workspace/users.controller.ts": fixture("nestjs/users.controller.ts") })
    );
    const getUser = result.endpoints.find((endpoint) => endpoint.method === "get");
    const createUser = result.endpoints.find((endpoint) => endpoint.method === "post");
    expect(getUser).toMatchObject({
      fullPath: "/users/:id",
      summary: "Get a user",
      tags: ["Users"],
      authentication: { type: "bearer" }
    });
    expect(getUser?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "id", location: "path" }),
        expect.objectContaining({ name: "page", location: "query" }),
        expect.objectContaining({ name: "authorization", location: "header" })
      ])
    );
    expect(createUser?.responses[0]).toMatchObject({
      statusCode: "201",
      description: "User created"
    });
  });

  it("infers DTO properties, optionality, primitive types and validation format", () => {
    const result = new NestControllerParser().parse(
      inMemoryProject({ "/workspace/users.controller.ts": fixture("nestjs/users.controller.ts") })
    );
    const schema = result.endpoints.find((endpoint) => endpoint.method === "post")?.requestBody
      ?.schema;
    expect(schema).toMatchObject({ type: "object", required: ["email", "age"] });
    expect(schema?.properties?.email).toMatchObject({ type: "string", format: "email" });
    expect(schema?.properties?.age).toMatchObject({ type: "number" });
  });
});
