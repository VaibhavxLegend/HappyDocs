import * as vscode from "vscode";

export class DocumentationPreview {
  show(markdown: string): void {
    const panel = vscode.window.createWebviewPanel(
      "happyDocs.preview",
      "HappyDocs API Documentation",
      vscode.ViewColumn.Beside,
      { enableScripts: false }
    );
    panel.webview.html = `<!doctype html><html><body><pre style="white-space:pre-wrap; font-family:var(--vscode-editor-font-family); color:var(--vscode-editor-foreground)">${escapeHtml(markdown)}</pre></body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
