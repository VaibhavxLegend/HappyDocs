# AI Enrichment Guide

HappyDocs provides an optional AI-assisted flow to fill gaps in your API documentation that static analysis cannot resolve (e.g., detailed parameter descriptions or realistic request/response examples).

## How it Works

Static analysis is deterministic and offline. AI enrichment is **opt-in** and occurs only when you explicitly trigger it.

1. **Manual Trigger**: Right-click an endpoint in the **API Docs** view and select **Enrich Documentation with AI**.
2. **Contextual Snippet**: HappyDocs sends a small snippet of the handler source code and the current metadata to the AI provider.
3. **Human-in-the-Loop**: The AI proposes changes. These are shown in a preview. You must explicitly **Accept** or **Reject** the suggestion before it is applied to your documentation.

## Setting Up the API Key

AI enrichment requires an OpenAI API key.

### Using the Extension Command
Run the command `Hybrid API Docs: Set OpenAI API Key` from the Command Palette. This stores the key securely in the VS Code Secret Storage.

### Using Environment Variables
Alternatively, you can set the `HAPPYDOCS_OPENAI_API_KEY` environment variable in your shell.

## Privacy and Security

- **No Automatic Uploads**: HappyDocs will never send your source code to an AI provider during a project scan.
- **Opt-in Only**: AI is only contacted when you trigger the enrichment command for a specific endpoint.
- **Secret Storage**: Keys are never written to configuration files or output documentation.

## Enabling the Feature

To use AI enrichment, you must first enable it in your settings:
`"hybridApiDocs.enableAiEnrichment": true`
