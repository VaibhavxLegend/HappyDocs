import * as vscode from "vscode";
import { getConfig } from "../core/config";
import { EndpointRegistry } from "../core/endpointRegistry";
import { generateMarkdown } from "../generators/markdownGenerator";
import { generateOpenApi, serializeOpenApi } from "../generators/openapiGenerator";
import { writeWorkspaceFile } from "../utils/fileUtils";

export async function exportOpenApi(registry: EndpointRegistry): Promise<void> {
  const root = workspaceRoot();
  const config = getConfig(root);
  const filename = config.openapiFormat === "json" ? "openapi.json" : "openapi.yaml";
  const content = serializeOpenApi(generateOpenApi(registry.all(), config), config.openapiFormat);
  const uri = await writeWorkspaceFile(root, `${config.outputDirectory}/${filename}`, content);
  await revealExport(uri, "OpenAPI");
}

export async function exportMarkdown(registry: EndpointRegistry): Promise<void> {
  const root = workspaceRoot();
  const config = getConfig(root);
  const content = generateMarkdown(registry.all(), config, root.fsPath);
  const uri = await writeWorkspaceFile(
    root,
    `${config.outputDirectory}/API_DOCUMENTATION.md`,
    content
  );
  await revealExport(uri, "Markdown documentation");
}

function workspaceRoot(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a workspace folder before exporting documentation.");
  return folder.uri;
}

async function revealExport(uri: vscode.Uri, label: string): Promise<void> {
  const choice = await vscode.window.showInformationMessage(`HappyDocs exported ${label}.`, "Open");
  if (choice === "Open") await vscode.commands.executeCommand("vscode.open", uri);
}
