import * as vscode from "vscode";
import { EndpointNode } from "../ui/endpointsTreeProvider";
import { getConfig } from "../core/config";
import { EndpointRegistry } from "../core/endpointRegistry";
import type { ApiEndpoint } from "../core/types";
import { generateMarkdown } from "../generators/markdownGenerator";
import { DocumentationPreview } from "../ui/webviewPreview";

export function previewDocumentation(
  registry: EndpointRegistry,
  preview: DocumentationPreview,
  selected?: EndpointNode | ApiEndpoint
): void {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) throw new Error("Open a workspace folder before previewing documentation.");
  const endpoint = selected instanceof EndpointNode ? selected.endpoint : selected;
  preview.show(
    generateMarkdown(endpoint ? [endpoint] : registry.all(), getConfig(root.uri), root.uri.fsPath)
  );
}
