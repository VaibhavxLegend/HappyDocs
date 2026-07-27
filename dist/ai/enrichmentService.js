"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnrichmentService = void 0;
const vscode = __importStar(require("vscode"));
const openaiProvider_1 = require("./openaiProvider");
const SECRET_KEY = "happyDocs.openaiApiKey";
class EnrichmentService {
    secrets;
    constructor(secrets) {
        this.secrets = secrets;
    }
    async setOpenAiKey() {
        const value = await vscode.window.showInputBox({
            prompt: "OpenAI API key",
            password: true,
            ignoreFocusOut: true
        });
        if (!value)
            return;
        await this.secrets.store(SECRET_KEY, value);
        void vscode.window.showInformationMessage("HappyDocs saved the API key in VS Code Secret Storage.");
    }
    async suggest(endpoint, config) {
        if (!config.enableAiEnrichment) {
            throw new Error("AI enrichment is disabled. Enable hybridApiDocs.enableAiEnrichment, then run this command again.");
        }
        const provider = await this.provider(config);
        const snippet = await relevantSnippet(endpoint);
        return provider.enrich(endpoint, snippet);
    }
    apply(endpoint, suggestion) {
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
    async provider(config) {
        if (config.aiProvider !== "openai")
            throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
        const key = (await this.secrets.get(SECRET_KEY)) ?? process.env.HAPPYDOCS_OPENAI_API_KEY;
        if (!key)
            throw new Error("No OpenAI API key is configured. Run “Hybrid API Docs: Set OpenAI API Key” or set HAPPYDOCS_OPENAI_API_KEY.");
        return new openaiProvider_1.OpenAiProvider(key);
    }
}
exports.EnrichmentService = EnrichmentService;
async function relevantSnippet(endpoint) {
    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(endpoint.source.filePath));
        const start = Math.max(endpoint.source.line - 4, 0);
        const end = Math.min(endpoint.source.line + 40, document.lineCount);
        return document.getText(new vscode.Range(start, 0, end, 0));
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=enrichmentService.js.map