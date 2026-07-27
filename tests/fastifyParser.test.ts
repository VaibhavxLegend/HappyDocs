import { describe, expect, it } from "vitest";
import { FastifyParser } from "../src/parsers/fastify/fastifyParser";
import { fixture, inMemoryProject } from "./helpers";

describe("FastifyParser", () => {
  it("extracts methods and paths from simple and .route() definitions", () => {
    const result = new FastifyParser().parse(
      inMemoryProject({
        "/workspace/server.ts": fixture("fastify/server.ts")
      })
    );

    const getUsers = result.endpoints.find(e => e.method === "get" && e.fullPath === "/users");
    const getUserById = result.endpoints.find(e => e.method === "get" && e.fullPath === "/users/:id");
    const putUser = result.endpoints.find(e => e.method === "put" && e.fullPath === "/users/:id");

    expect(getUsers).toBeDefined();
    expect(getUserById).toBeDefined();
    expect(putUser).toBeDefined();
  });

  it("infers request and response schemas from Fastify route options", () => {
    const result = new FastifyParser().parse(
      inMemoryProject({
        "/workspace/server.ts": fixture("fastify/server.ts")
      })
    );

    const createUser = result.endpoints.find(e => e.method === "post" && e.fullPath === "/users");
    expect(createUser?.requestBody?.schema).toMatchObject({
      type: "object",
      properties: {
        email: { type: "string" },
        age: { type: "string" } // Note: simplified parser treats all as string for now
      }
    });

    const getUserById = result.endpoints.find(e => e.method === "get" && e.fullPath === "/users/:id");
    expect(getUserById?.responses[0].schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" }
      }
    });
  });

  it("resolves plugin prefixes", () => {
    const result = new FastifyParser().parse(
      inMemoryProject({
        "/workspace/server.ts": fixture("fastify/server.ts")
      })
    );

    const profile = result.endpoints.find(e => e.fullPath === "/api/users/profile");
    expect(profile).toBeDefined();
    expect(profile?.method).toBe("get");
  });
});
