import * as vscode from "vscode";
import type { ApiEndpoint } from "./types";
import { deduplicateEndpoints } from "./endpointDeduplicator";
import type { VerificationResult } from "./verificationService";

export class EndpointRegistry implements vscode.Disposable {
  private endpoints = new Map<string, ApiEndpoint>();
  private verificationResults = new Map<string, VerificationResult>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  replace(endpoints: ApiEndpoint[]): void {
    this.endpoints.clear();
    this.verificationResults.clear();
    for (const endpoint of deduplicateEndpoints(endpoints))
      this.endpoints.set(`${endpoint.method}:${endpoint.fullPath}`, endpoint);
    this.emitter.fire();
  }

  add(endpoint: ApiEndpoint): void {
    const key = `${endpoint.method}:${endpoint.fullPath}`;
    this.endpoints.set(
      key,
      deduplicateEndpoints(
        [this.endpoints.get(key), endpoint].filter((value): value is ApiEndpoint => Boolean(value))
      )[0]
    );
  }

  all(): ApiEndpoint[] {
    return [...this.endpoints.values()].sort(
      (a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method)
    );
  }

  get(id: string): ApiEndpoint | undefined {
    return this.all().find((endpoint) => endpoint.id === id);
  }

  update(endpoint: ApiEndpoint): void {
    this.endpoints.set(`${endpoint.method}:${endpoint.fullPath}`, endpoint);
    this.emitter.fire();
  }

  setVerification(id: string, result: VerificationResult): void {
    this.verificationResults.set(id, result);
    this.emitter.fire();
  }

  getVerification(id: string): VerificationResult | undefined {
    return this.verificationResults.get(id);
  }

  clear(): void {
    this.endpoints.clear();
    this.verificationResults.clear();
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
