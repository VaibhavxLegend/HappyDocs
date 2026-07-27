# HappyDocs

HappyDocs is a VS Code extension that turns backend source code into maintainable API documentation. It statically parses TypeScript and JavaScript ASTs, so the core scan is deterministic, offline, and does not need an AI key.

It currently supports Express applications and NestJS controllers. It produces OpenAPI 3.1 (YAML or JSON) and a readable Markdown guide, with source locations and confidence information carried through to the output.

For detailed usage instructions, see the [Guides](./docs/guides/).


## Install and run

Prerequisites: Node.js 20+ and VS Code 1.95+.

```bash
npm install
npm run compile
```

Open this folder in VS Code and press `F5` to launch an Extension Development Host. In that window, open a backend repository and run **Hybrid API Docs: Scan Project** from the Command Palette.

For local packaging:

```bash
npm run package
```

This produces a `.vsix` file that can be installed with VS Code’s **Extensions: Install from VSIX…** command.

## Commands

| Command                                         | What it does                                                |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `Hybrid API Docs: Scan Project`                 | Scans configured source folders and updates the sidebar.    |
| `Hybrid API Docs: Rescan Project`               | Clears the source-content cache and scans again.            |
| `Hybrid API Docs: Preview Documentation`        | Opens generated Markdown in a HappyDocs preview.            |
| `Hybrid API Docs: Export OpenAPI`               | Writes `openapi.yaml` or `openapi.json`.                    |
| `Hybrid API Docs: Export Markdown`              | Writes `API_DOCUMENTATION.md`.                              |
| `Hybrid API Docs: Enrich Documentation with AI` | Generates a reviewable, opt-in suggestion for one endpoint. |
| `Hybrid API Docs: Clear Scan Results`           | Clears the sidebar, diagnostics, and scanner cache.         |
| `Hybrid API Docs: Set OpenAI API Key`           | Stores a key in VS Code Secret Storage.                     |

The endpoint context menu also provides preview, export, and enrichment actions. Endpoint clicks open their source location.

## Settings

```json
{
  "hybridApiDocs.include": ["src/**/*.{ts,js}"],
  "hybridApiDocs.exclude": ["**/node_modules/**", "**/dist/**", "**/*.test.*"],
  "hybridApiDocs.frameworks": ["express", "nestjs"],
  "hybridApiDocs.outputDirectory": "docs/api",
  "hybridApiDocs.openapiFormat": "yaml",
  "hybridApiDocs.apiTitle": "My API",
  "hybridApiDocs.apiVersion": "1.0.0",
  "hybridApiDocs.baseUrl": "http://localhost:3000",
  "hybridApiDocs.enableAiEnrichment": false,
  "hybridApiDocs.aiProvider": "openai"
}
```

HappyDocs additionally reads `hybridApiDocs.apiDescription` and `hybridApiDocs.maxFiles`. Its default include patterns cover `src/`, `app/`, `routes/`, and `controllers/`. Build directories, dependency directories, generated files, tests, and coverage are excluded by default.

## Supported patterns

### Express

- `app.get/post/put/patch/delete/head/options(path, ...middleware, handler)`
- `router.get(...)`, including handlers declared as functions or arrow-function variables
- `router.route("/users").get(handler).post(handler)`
- Local and imported `Router()` instances registered via `app.use("/api", router)`
- Nested router mounts such as `router.use("/v1", childRouter)`
- Statically evaluable route constants and string concatenation
- `req.params`, `req.query`, `req.body`, JSDoc, middleware names, and basic `res.status(...).json()`, `res.json()`, and `res.send()` response hints

### NestJS

- `@Controller`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, and `@Options`
- `@Param`, `@Query`, `@Body`, and `@Headers`
- `@UseGuards`, `@UseInterceptors`, `@HttpCode`, `@ApiTags`, `@ApiOperation`, and `@ApiResponse`
- DTO class properties, optional fields, primitives, arrays, enums, and `@IsString`, `@IsEmail`, `@IsOptional`, and `@IsNumber`

## Output and traceability

OpenAPI operations include `x-source-location`, `x-happydocs-confidence`, and `x-happydocs-unresolved` fields. Markdown includes the same source and confidence information plus a **Documentation gaps** section. See the generated examples in [docs/api/openapi.yaml](docs/api/openapi.yaml) and [docs/api/API_DOCUMENTATION.md](docs/api/API_DOCUMENTATION.md).

## Optional AI enrichment

AI enrichment is disabled by default. Scanning and exports never contact an AI provider. When a developer explicitly runs the enrichment command, HappyDocs sends the normalized endpoint metadata and a small nearby source snippet to the configured provider. It then opens a preview and asks the user to accept or reject the suggestion.

Accepted suggestions are labeled as AI-assisted in Markdown and OpenAPI. The OpenAI key is read from VS Code Secret Storage first, then `HAPPYDOCS_OPENAI_API_KEY`. It is never written to output files or displayed in errors. Optionally set `HAPPYDOCS_OPENAI_MODEL` to select the provider model.

## Limitations and confidence

HappyDocs intentionally does not guess when source construction cannot be resolved. Dynamic paths, circular router registration, unresolvable handlers, and partial code are retained as source expressions and marked with lower confidence or warnings. It does not currently execute application code, resolve arbitrary dependency-injection graphs, infer runtime-only middleware behavior, or support Fastify, Koa, Spring, Django, Flask, or Go frameworks. The adapter interface is designed for those additions.

For very large repositories, HappyDocs reads source files asynchronously, avoids scanning excluded trees, caps scans with `maxFiles`, and reuses unchanged file content across manual scans. It supports multi-root workspaces; exports use the first workspace folder.

## Development and verification

```bash
npm install
npm run compile
npm test
npm run lint
npm run format:check
npm run package
```

The test suite covers Express method/path extraction, nested router prefixes, parameters and responses, NestJS decorators and DTO schemas, OpenAPI and Markdown generation, dynamic-route confidence, duplicate endpoints, and invalid-source recovery. Fixtures live under `tests/fixtures/`.

## Project layout

```text
src/
  commands/       VS Code command handlers
  core/           scanner, registry, configuration, diagnostics, normalized types
  parsers/        framework adapter interface plus Express and NestJS adapters
  generators/     OpenAPI 3.1 and Markdown output
  ai/             opt-in provider abstraction and reviewable enrichment flow
  ui/             API Docs tree view and preview panel
  utils/          AST, path, and workspace-file helpers
tests/            parser and generator tests with realistic fixtures
examples/         small Express and NestJS source examples
docs/api/         generated output examples
```
