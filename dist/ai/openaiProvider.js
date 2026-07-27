"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiProvider = void 0;
const promptBuilder_1 = require("./promptBuilder");
/** Minimal Responses API client. The key is provided by SecretStorage or environment, never logged. */
class OpenAiProvider {
    apiKey;
    model;
    id = "openai";
    constructor(apiKey, model = process.env.HAPPYDOCS_OPENAI_MODEL ?? "gpt-4.1-mini") {
        this.apiKey = apiKey;
        this.model = model;
    }
    async enrich(endpoint, sourceSnippet) {
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
            body: JSON.stringify({
                model: this.model,
                input: (0, promptBuilder_1.buildEnrichmentPrompt)(endpoint, sourceSnippet),
                temperature: 0.2,
                text: { format: { type: "json_object" } }
            })
        });
        if (!response.ok)
            throw new Error(`AI enrichment request failed (${response.status}). Check your API key and model configuration.`);
        const payload = (await response.json());
        const output = extractOutput(payload);
        try {
            return JSON.parse(output);
        }
        catch {
            throw new Error("The AI provider returned an invalid enrichment response.");
        }
    }
}
exports.OpenAiProvider = OpenAiProvider;
function extractOutput(payload) {
    if (typeof payload.output_text === "string")
        return payload.output_text;
    const output = payload.output;
    if (Array.isArray(output)) {
        for (const item of output) {
            if (!item || typeof item !== "object")
                continue;
            const content = item.content;
            if (!Array.isArray(content))
                continue;
            for (const block of content) {
                if (block &&
                    typeof block === "object" &&
                    typeof block.text === "string")
                    return block.text;
            }
        }
    }
    throw new Error("The AI provider returned no text output.");
}
//# sourceMappingURL=openaiProvider.js.map