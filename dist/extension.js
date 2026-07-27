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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const enrichmentService_1 = require("./ai/enrichmentService");
const exportDocs_1 = require("./commands/exportDocs");
const previewDocs_1 = require("./commands/previewDocs");
const scanProject_1 = require("./commands/scanProject");
const config_1 = require("./core/config");
const diagnostics_1 = require("./core/diagnostics");
const endpointRegistry_1 = require("./core/endpointRegistry");
const scanner_1 = require("./core/scanner");
const markdownGenerator_1 = require("./generators/markdownGenerator");
const endpointsTreeProvider_1 = require("./ui/endpointsTreeProvider");
const webviewPreview_1 = require("./ui/webviewPreview");
function activate(context) {
    const scanner = new scanner_1.ProjectScanner();
    const registry = new endpointRegistry_1.EndpointRegistry();
    const diagnostics = new diagnostics_1.DiagnosticsReporter();
    const preview = new webviewPreview_1.DocumentationPreview();
    const enrichment = new enrichmentService_1.EnrichmentService(context.secrets);
    const tree = new endpointsTreeProvider_1.EndpointsTreeProvider(registry);
    context.subscriptions.push(registry, diagnostics, tree, vscode.window.registerTreeDataProvider("happyDocs.endpoints", tree));
    context.subscriptions.push(vscode.commands.registerCommand("happyDocs.scanProject", () => (0, scanProject_1.scanProject)(scanner, registry, diagnostics)), vscode.commands.registerCommand("happyDocs.rescanProject", () => (0, scanProject_1.scanProject)(scanner, registry, diagnostics, true)), vscode.commands.registerCommand("happyDocs.previewDocumentation", (item) => (0, previewDocs_1.previewDocumentation)(registry, preview, item)), vscode.commands.registerCommand("happyDocs.exportOpenApi", () => (0, exportDocs_1.exportOpenApi)(registry).catch(showError)), vscode.commands.registerCommand("happyDocs.exportMarkdown", () => (0, exportDocs_1.exportMarkdown)(registry).catch(showError)), vscode.commands.registerCommand("happyDocs.clearScanResults", () => {
        scanner.clearCache();
        registry.clear();
        diagnostics.publish([]);
        void vscode.window.showInformationMessage("HappyDocs scan results cleared.");
    }), vscode.commands.registerCommand("happyDocs.setOpenAiKey", () => enrichment.setOpenAiKey().catch(showError)), vscode.commands.registerCommand("happyDocs.enrichDocumentation", (item) => enrichDocumentation(item, registry, enrichment, preview).catch(showError)));
}
async function enrichDocumentation(item, registry, enrichment, preview) {
    let endpoint = item instanceof endpointsTreeProvider_1.EndpointNode ? item.endpoint : item;
    if (!endpoint) {
        const choices = registry.all().map((candidate) => ({
            label: `${candidate.method.toUpperCase()} ${candidate.fullPath}`,
            endpoint: candidate
        }));
        endpoint = (await vscode.window.showQuickPick(choices, { placeHolder: "Select an endpoint to enrich" }))?.endpoint;
    }
    if (!endpoint)
        return;
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root)
        throw new Error("Open a workspace folder before using AI enrichment.");
    const suggestion = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "HappyDocs: generating AI suggestion"
    }, () => enrichment.suggest(endpoint, (0, config_1.getConfig)(root.uri)));
    const suggestionText = (0, markdownGenerator_1.generateMarkdown)([
        {
            ...endpoint,
            summary: suggestion.summary ?? endpoint.summary,
            description: suggestion.description ?? endpoint.description,
            aiEnrichment: {
                provider: "openai",
                generatedAt: new Date().toISOString(),
                accepted: false,
                parameterDescriptions: suggestion.parameterDescriptions,
                requestExample: suggestion.requestExample,
                responseExamples: suggestion.responseExamples,
                warnings: suggestion.warnings
            }
        }
    ], (0, config_1.getConfig)(root.uri), root.uri.fsPath);
    preview.show(suggestionText);
    const decision = await vscode.window.showQuickPick(["Accept AI suggestion", "Reject"], {
        placeHolder: "Review the preview, then choose whether to apply the suggestion"
    });
    if (decision === "Accept AI suggestion") {
        registry.update(enrichment.apply(endpoint, suggestion));
        void vscode.window.showInformationMessage("HappyDocs applied the AI-assisted suggestion. It is labeled in generated documentation.");
    }
}
function showError(error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : "HappyDocs encountered an unexpected error.");
}
function deactivate() {
    // VS Code disposes registered subscriptions during deactivation.
}
//# sourceMappingURL=extension.js.map