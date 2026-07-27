import * as vscode from "vscode";
import type { AiProvider } from "./aiProvider";
import { OpenAiProvider } from "./openaiProvider";
import type { ApiEndpoint, EndpointEnrichmentSuggestion, HappyDocsConfig } from "../core/types";

const SECRET_KEY = "happyDocs.openaiApiKey";

export class EnrichmentService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async setOpenAiKey(): Promise<void> {
    const value = await vscode.window.showInputBox({
      prompt: "OpenAI API key",
      password: true,
      ignoreFocusOut: true
    });
    if (!value) return;
    await this.secrets.store(SECRET_KEY, value);
    void vscode.window.showInformationMessage(
      "HappyDocs saved the API key in VS Code Secret Storage."
    );
  }

  async suggest(
    endpoint: ApiEndpoint,
    config: HappyDocsConfig
  ): Promise<EndpointEnrichmentSuggestion> {
    if (!config.enableAiEnrichment) {
      throw new Error(
        "AI enrichment is disabled. Enable hybridApiDocs.enableAiEnrichment, then run this command again."
      );
    }
    const provider = await this.provider(config);
    const snippet = await relevantSnippet(endpoint);
    return provider.enrich(endpoint, snippet);
  }

  apply(endpoint: ApiEndpoint, suggestion: EndpointEnrichmentSuggestion): ApiEndpoint {
    const parameters = endpoint.parameters.map((parameter) => ({
      ...parameter,
      description: suggestion.parameterDescriptions?.[parameter.name] ?? parameter.description
    }));
    const responses = endpoint.responses.map((response) => ({
      ...response,
      example: suggestion.responseExamples?.[response.statusCode] ?? response.example
    }));
    return {
      ...endpoint,
      summary: suggestion.summary ?? endpoint.summary,
      description: suggestion.description ?? endpoint.description,
      parameters,
      requestBody: endpoint.requestBody
        ? {
            ...endpoint.requestBody,
            example: suggestion.requestExample ?? endpoint.requestBody.example
          }
        : undefined,
      responses,
      unresolvedItems: [
        ...new Set([
          ...endpoint.unresolvedItems,
          ...(suggestion.warnings ?? []).map((warning) => `AI suggestion: ${warning}`)
        ])
      ],
      aiEnrichment: {
        provider: "openai",
        generatedAt: new Date().toISOString(),
        accepted: true,
        parameterDescriptions: suggestion.parameterDescriptions,
        requestExample: suggestion.requestExample,
        responseExamples: suggestion.responseExamples,
        warnings: suggestion.warnings
      }
    };
  }

  private async provider(config: HappyDocsConfig): Promise<AiProvider> {
    if (config.aiProvider !== "openai")
      throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
    const key = (await this.secrets.get(SECRET_KEY)) ?? process.env.HAPPYDOCS_OPENAI_API_KEY;
    if (!key)
      throw new Error(
        "No OpenAI API key is configured. Run “Hybrid API Docs: Set OpenAI API Key” or set HAPPYDOCS_OPENAI_API_KEY."
      );
    return new OpenAiProvider(key);
  }
}

async function relevantSnippet(endpoint: ApiEndpoint): Promise<string | undefined> {
  try {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(endpoint.source.filePath)
    );
    const start = Math.max(endpoint.source.line - 4, 0);
    const end = Math.min(endpoint.source.line + 40, document.lineCount);
    return document.getText(new vscode.Range(start, 0, end, 0));
  } catch {
    return undefined;
  }
}
