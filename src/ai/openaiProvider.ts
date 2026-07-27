import type { AiProvider } from "./aiProvider";
import { buildEnrichmentPrompt } from "./promptBuilder";
import type { ApiEndpoint, EndpointEnrichmentSuggestion } from "../core/types";

/** Minimal Responses API client. The key is provided by SecretStorage or environment, never logged. */
export class OpenAiProvider implements AiProvider {
  readonly id = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.HAPPYDOCS_OPENAI_MODEL ?? "gpt-4.1-mini"
  ) {}

  async enrich(
    endpoint: ApiEndpoint,
    sourceSnippet?: string
  ): Promise<EndpointEnrichmentSuggestion> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        input: buildEnrichmentPrompt(endpoint, sourceSnippet),
        temperature: 0.2,
        text: { format: { type: "json_object" } }
      })
    });
    if (!response.ok)
      throw new Error(
        `AI enrichment request failed (${response.status}). Check your API key and model configuration.`
      );
    const payload = (await response.json()) as Record<string, unknown>;
    const output = extractOutput(payload);
    try {
      return JSON.parse(output) as EndpointEnrichmentSuggestion;
    } catch {
      throw new Error("The AI provider returned an invalid enrichment response.");
    }
  }
}

function extractOutput(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = payload.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (
          block &&
          typeof block === "object" &&
          typeof (block as { text?: unknown }).text === "string"
        )
          return (block as { text: string }).text;
      }
    }
  }
  throw new Error("The AI provider returned no text output.");
}
