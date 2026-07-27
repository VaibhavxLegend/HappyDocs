import { describe, expect, it } from "vitest";
import { ExpressParser } from "../src/parsers/express/expressParser";
import { fixture, inMemoryProject } from "./helpers";

describe("ExpressParser", () => {
  it("extracts methods, path/query parameters, middleware and response hints", () => {
    const result = new ExpressParser().parse(
      inMemoryProject({
        "/workspace/app.ts": fixture("express/app.ts"),
        "/workspace/users.ts": fixture("express/users.ts")
      })
    );
    const getUser = result.endpoints.find(
      (endpoint) => endpoint.method === "get" && endpoint.fullPath === "/api/users/:id"
    );
    const createUser = result.endpoints.find(
      (endpoint) => endpoint.method === "post" && endpoint.fullPath === "/api/users"
    );
    expect(getUser).toMatchObject({ confidence: "high", middleware: ["requireAuth"] });
    expect(getUser?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "id", location: "path", required: true }),
        expect.objectContaining({ name: "page", location: "query" })
      ])
    );
    expect(getUser?.responses[0]).toMatchObject({
      statusCode: "200",
      contentType: "application/json"
    });
    expect(createUser?.requestBody?.schema.properties).toHaveProperty("email");
    expect(createUser?.responses[0].statusCode).toBe("201");
  });

  it("resolves nested and imported router prefixes", () => {
    const result = new ExpressParser().parse(
      inMemoryProject({
        "/workspace/app.ts": `const app = express(); const parent = Router(); const child = Router(); child.get('/items', h); parent.use('/v1', child); app.use('/api', parent); function h(req, res) { res.json({ ok: true }); }`,
        "/workspace/routes.ts": `const unused = Router();`
      })
    );
    expect(
      result.endpoints.find((endpoint) => endpoint.fullPath === "/api/v1/items")
    ).toBeDefined();
  });

  it("marks unresolvable dynamic paths as low confidence", () => {
    const result = new ExpressParser().parse(
      inMemoryProject({
        "/workspace/app.ts": `const app = express(); app.get(process.env.BASE_PATH + '/users', handler); function handler(req, res) { res.json({}); }`
      })
    );
    expect(result.endpoints[0]).toMatchObject({ confidence: "low" });
    expect(result.endpoints[0].unresolvedItems.join(" ")).toContain("Dynamic route expression");
  });

  it("recovers from invalid source without throwing", () => {
    expect(() =>
      new ExpressParser().parse(
        inMemoryProject({ "/workspace/invalid.ts": fixture("express/invalid.ts") })
      )
    ).not.toThrow();
  });
});
