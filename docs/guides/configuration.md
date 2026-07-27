# Configuration Guide

HappyDocs allows you to fine-tune how your project is scanned using VS Code settings.

## Source Globs

You can control which files the scanner analyzes using `include` and `exclude` patterns.

### Including Files
The `hybridApiDocs.include` setting accepts an array of glob patterns. By default, it covers common source directories:
- `src/**/*.{ts,tsx,js,jsx}`
- `app/**/*.{ts,tsx,js,jsx}`
- `routes/**/*.{ts,tsx,js,jsx}`
- `controllers/**/*.{ts,tsx,js,jsx}`

If your project uses a different structure (e.g., `api/v1/*.ts`), add that pattern to this list.

### Excluding Files
The `hybridApiDocs.exclude` setting defines patterns that are always ignored, even if they match an include pattern. Defaults include:
- `**/node_modules/**`
- `**/dist/**`
- `**/build/**`
- `**/coverage/**`
- `**/*.test.*`
- `**/*.spec.*`
- `**/*.generated.*`

Use this to skip large auto-generated files or test suites that might contain mock endpoints.

## Framework Selection

The `hybridApiDocs.frameworks` setting determines which adapters are active. 
- **Express**: Scans for `app.get`, `router.use`, etc.
- **NestJS**: Scans for `@Controller` and method decorators.

If you use multiple frameworks in a monorepo, enable both. If you disable a framework that is detected in your code, HappyDocs will issue a warning diagnostic.

## Output Settings

- **Output Directory**: `hybridApiDocs.outputDirectory` defines where the `openapi.yaml` and `API_DOCUMENTATION.md` files are written (relative to the workspace root).
- **API Metadata**: Use `hybridApiDocs.apiTitle`, `apiVersion`, and `baseUrl` to populate the header of your generated documentation.
- **Max Files**: `hybridApiDocs.maxFiles` is a safety cap. If your project has thousands of files, increase this value to ensure the entire API is captured.
