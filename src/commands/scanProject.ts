import * as vscode from "vscode";
import { DiagnosticsReporter } from "../core/diagnostics";
import { EndpointRegistry } from "../core/endpointRegistry";
import { ProjectScanner } from "../core/scanner";

export async function scanProject(
  scanner: ProjectScanner,
  registry: EndpointRegistry,
  diagnostics: DiagnosticsReporter,
  clearCache = false
): Promise<void> {
  if (clearCache) scanner.clearCache();
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "HappyDocs: scanning API source",
      cancellable: true
    },
    async (progress, token) => {
      const result = await scanner.scan((message) => progress.report({ message }), token);
      registry.replace(result.endpoints);
      diagnostics.publish(result.diagnostics);
      const detail = `${result.endpoints.length} endpoint${result.endpoints.length === 1 ? "" : "s"}; ${result.scannedFiles} read, ${result.cachedFiles} cached.`;
      void vscode.window.showInformationMessage(`HappyDocs scan complete: ${detail}`);
    }
  );
}
