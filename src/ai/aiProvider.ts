import type { ApiEndpoint, EndpointEnrichmentSuggestion } from "../core/types";

export interface AiProvider {
  readonly id: string;
  enrich(endpoint: ApiEndpoint, sourceSnippet?: string): Promise<EndpointEnrichmentSuggestion>;
}
