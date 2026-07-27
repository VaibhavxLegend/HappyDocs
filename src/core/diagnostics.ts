import * as vscode from "vscode";
import type { ScanDiagnostic } from "./types";

export class DiagnosticsReporter implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("HappyDocs");

  publish(diagnostics: ScanDiagnostic[]): void {
    this.collection.clear();
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const item of diagnostics) {
      if (!item.filePath) continue;
      const range = new vscode.Range(
        Math.max((item.line ?? 1) - 1, 0),
        0,
        Math.max((item.line ?? 1) - 1, 0),
        1
      );
      const diagnostic = new vscode.Diagnostic(range, item.message, toSeverity(item.severity));
      diagnostic.source = item.source ?? "HappyDocs";
      const existing = grouped.get(item.filePath) ?? [];
      existing.push(diagnostic);
      grouped.set(item.filePath, existing);
    }
    for (const [filePath, items] of grouped) this.collection.set(vscode.Uri.file(filePath), items);
  }

  dispose(): void {
    this.collection.dispose();
  }
}

function toSeverity(severity: ScanDiagnostic["severity"]): vscode.DiagnosticSeverity {
  if (severity === "error") return vscode.DiagnosticSeverity.Error;
  if (severity === "warning") return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}
