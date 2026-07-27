import * as vscode from "vscode";
import type { ApiEndpoint, ScanDiagnostic, HappyDocsConfig } from "./types";

export interface VerificationResult {
  reachable: boolean;
  statusCode?: number;
  error?: string;
}

export class VerificationService {
  /**
   * Verifies a set of endpoints by sending a HEAD or GET request to the configured baseUrl.
   */
  async verifyEndpoints(
    endpoints: ApiEndpoint[],
    config: HappyDocsConfig,
    onProgress?: (message: string, increment?: number) => void
  ): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();
    const baseUrl = config.baseUrl.replace(/\\/$/, "");

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      onProgress?.(`Verifying ${endpoint.fullPath}...`, Math.round((i / endpoints.length) * 100));

      try {
        const url = `${baseUrl}${endpoint.fullPath}`;
        // Use HEAD if possible to be lightweight, otherwise GET
        const response = await fetch(url, {
          method: "HEAD",
          headers: { "User-Agent": "HappyDocs-Verification/1.0" }
        }).catch(() => fetch(url, {
          method: "GET",
          headers: { "User-Agent": "HappyDocs-Verification/1.0" }
        }));

        results.set(endpoint.id, {
          reachable: response.ok || (response.status >= 400 && response.status < 600),
          statusCode: response.status
        });
      } catch (error) {
        results.set(endpoint.id, {
          reachable: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  generateDiagnostics(
    endpoints: ApiEndpoint[],
    results: Map<string, VerificationResult>
  ): ScanDiagnostic[] {
    const diagnostics: ScanDiagnostic[] = [];
    for (const endpoint of endpoints) {
      const result = results.get(endpoint.id);
      if (!result || !result.reachable) {
        diagnostics.push({
          severity: "warning",
          message: `Endpoint ${endpoint.method.toUpperCase()} ${endpoint.fullPath} is not reachable at the configured base URL.`,
          filePath: endpoint.source.filePath,
          line: endpoint.source.line,
          source: "HappyDocs-Verification"
        });
      }
    }
    return diagnostics;
  }
}
