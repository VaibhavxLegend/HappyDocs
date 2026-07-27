import * as vscode from "vscode";
import { EnrichmentService } from "./ai/enrichmentService";
import { exportMarkdown, exportOpenApi } from "./commands/exportDocs";
import { previewDocumentation } from "./commands/previewDocs";
import { scanProject } from "./commands/scanProject";
import { getConfig } from "./core/config";
import { DiagnosticsReporter } from "./core/diagnostics";
import { EndpointRegistry } from "./core/endpointRegistry";
import { ProjectScanner } from "./core/scanner";
import type { ApiEndpoint } from "./core/types";
import { generateMarkdown } from "./generators/markdownGenerator";
import { EndpointNode, EndpointsTreeProvider } from "./ui/endpointsTreeProvider";
import { DocumentationPreview } from "./ui/webviewPreview";

export function activate(context: vscode.ExtensionContext): void {
  const scanner = new ProjectScanner();
  const registry = new EndpointRegistry();
  const diagnostics = new DiagnosticsReporter();
  const preview = new DocumentationPreview();
  const enrichment = new EnrichmentService(context.secrets);
  const tree = new EndpointsTreeProvider(registry);
  context.subscriptions.push(
    registry,
    diagnostics,
    tree,
    vscode.window.registerTreeDataProvider("happyDocs.endpoints", tree)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("happyDocs.scanProject", () =>
      scanProject(scanner, registry, diagnostics)
    ),
    vscode.commands.registerCommand("happyDocs.rescanProject", () =>
      scanProject(scanner, registry, diagnostics, true)
    ),
    vscode.commands.registerCommand(
      "happyDocs.previewDocumentation",
      (item?: EndpointNode | ApiEndpoint) => previewDocumentation(registry, preview, item)
    ),
    vscode.commands.registerCommand("happyDocs.exportOpenApi", () =>
      exportOpenApi(registry).catch(showError)
    ),
    vscode.commands.registerCommand("happyDocs.exportMarkdown", () =>
      exportMarkdown(registry).catch(showError)
    ),
    vscode.commands.registerCommand("happyDocs.clearScanResults", () => {
      scanner.clearCache();
      registry.clear();
      diagnostics.publish([]);
      void vscode.window.showInformationMessage("HappyDocs scan results cleared.");
    }),
    vscode.commands.registerCommand("happyDocs.setOpenAiKey", () =>
      enrichment.setOpenAiKey().catch(showError)
    ),
    vscode.commands.registerCommand(
      "happyDocs.enrichDocumentation",
      (item?: EndpointNode | ApiEndpoint) =>
        enrichDocumentation(item, registry, enrichment, preview).catch(showError)
    )
  );
}

async function enrichDocumentation(
  item: EndpointNode | ApiEndpoint | undefined,
  registry: EndpointRegistry,
  enrichment: EnrichmentService,
  preview: DocumentationPreview
): Promise<void> {
  let endpoint = item instanceof EndpointNode ? item.endpoint : item;
  if (!endpoint) {
    const choices = registry.all().map((candidate) => ({
      label: `${candidate.method.toUpperCase()} ${candidate.fullPath}`,
      endpoint: candidate
    }));
    endpoint = (
      await vscode.window.showQuickPick(choices, { placeHolder: "Select an endpoint to enrich" })
    )?.endpoint;
  }
  if (!endpoint) return;
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) throw new Error("Open a workspace folder before using AI enrichment.");
  const suggestion = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "HappyDocs: generating AI suggestion"
    },
    () => enrichment.suggest(endpoint!, getConfig(root.uri))
  );
  const suggestionText = generateMarkdown(
    [
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
    ],
    getConfig(root.uri),
    root.uri.fsPath
  );
  preview.show(suggestionText);
  const decision = await vscode.window.showQuickPick(["Accept AI suggestion", "Reject"], {
    placeHolder: "Review the preview, then choose whether to apply the suggestion"
  });
  if (decision === "Accept AI suggestion") {
    registry.update(enrichment.apply(endpoint, suggestion));
    void vscode.window.showInformationMessage(
      "HappyDocs applied the AI-assisted suggestion. It is labeled in generated documentation."
    );
  }
}

function showError(error: unknown): void {
  void vscode.window.showErrorMessage(
    error instanceof Error ? error.message : "HappyDocs encountered an unexpected error."
  );
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions during deactivation.
}
