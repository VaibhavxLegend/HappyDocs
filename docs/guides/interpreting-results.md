# Interpreting Results

HappyDocs uses a "Confidence" system to tell you how certain it is about the extracted metadata.

## Confidence Levels

### High Confidence
The parser found an explicit route definition with clearly defined parameters and handlers. These results are typically 100% accurate.

### Medium Confidence
The parser resolved the route and handler, but some metadata (like response types) was inferred from common patterns or JSDoc rather than explicit type definitions.

### Low Confidence
The parser found a route but encountered an "unresolved item." This usually happens when:
- The route path is dynamic (e.g., uses a variable from `process.env`).
- The handler is imported from a complex dynamic module.
- The source code is partially invalid or missing.

## Documentation Gaps

At the bottom of the generated Markdown documentation, you will find a **Documentation gaps** section. This lists every "Low Confidence" item found during the scan.

Each gap typically includes:
- The endpoint method and path.
- The specific reason for the gap (e.g., "Dynamic route expression").

### How to Resolve Gaps
1. **Refactor Code**: Use static string literals for route paths where possible.
2. **Add Type Annotations**: Use explicit TypeScript types for request bodies and responses.
3. **AI Enrichment**: Use the **Enrich Documentation with AI** command to have an LLM suggest the missing information based on the code logic.
