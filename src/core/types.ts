import type { Uri } from "vscode";
import type { SourceFile } from "ts-morph";

export type SupportedFramework = "express" | "nestjs" | "unknown";
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
export type Confidence = "high" | "medium" | "low";
export type ParameterLocation = "path" | "query" | "header" | "cookie";

export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface ApiSchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  format?: string;
  description?: string;
  enum?: Array<string | number>;
  items?: ApiSchema;
  properties?: Record<string, ApiSchema>;
  required?: string[];
  additionalProperties?: boolean;
  example?: unknown;
  nullable?: boolean;
  $ref?: string;
}

export interface ApiParameter {
  name: string;
  location: ParameterLocation;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
  example?: unknown;
  schema?: ApiSchema;
}

export interface RequestBodyMetadata {
  required: boolean;
  description?: string;
  contentType: string;
  schema: ApiSchema;
  example?: unknown;
}

export interface ApiResponse {
  statusCode: string;
  description: string;
  contentType?: string;
  schema?: ApiSchema;
  example?: unknown;
}

export interface AuthenticationMetadata {
  type: "bearer" | "apiKey" | "basic" | "unknown";
  name?: string;
  description?: string;
}

export interface AiEnrichment {
  provider: string;
  generatedAt: string;
  accepted: boolean;
  parameterDescriptions?: Record<string, string>;
  requestExample?: unknown;
  responseExamples?: Record<string, unknown>;
  warnings?: string[];
}

export interface ApiEndpoint {
  id: string;
  framework: SupportedFramework;
  method: HttpMethod;
  path: string;
  fullPath: string;
  summary?: string;
  description?: string;
  tags: string[];
  source: SourceLocation;
  parameters: ApiParameter[];
  requestBody?: RequestBodyMetadata;
  responses: ApiResponse[];
  authentication?: AuthenticationMetadata;
  middleware: string[];
  confidence: Confidence;
  unresolvedItems: string[];
  aiEnrichment?: AiEnrichment;
}

export interface ScanDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  filePath?: string;
  line?: number;
  source?: string;
}

export interface ScanResult {
  endpoints: ApiEndpoint[];
  diagnostics: ScanDiagnostic[];
  scannedFiles: number;
  cachedFiles: number;
}

export interface HappyDocsConfig {
  include: string[];
  exclude: string[];
  frameworks: Array<"express" | "nestjs">;
  outputDirectory: string;
  openapiFormat: "yaml" | "json";
  apiTitle: string;
  apiVersion: string;
  apiDescription: string;
  baseUrl: string;
  enableAiEnrichment: boolean;
  aiProvider: "openai";
  maxFiles: number;
}

export interface ParserContext {
  workspaceUri?: Uri;
  sourceFiles: SourceFile[];
  config: HappyDocsConfig;
}

export interface ParserResult {
  endpoints: ApiEndpoint[];
  diagnostics: ScanDiagnostic[];
}

export interface EndpointEnrichmentSuggestion {
  summary?: string;
  description?: string;
  parameterDescriptions?: Record<string, string>;
  requestExample?: unknown;
  responseExamples?: Record<string, unknown>;
  warnings?: string[];
}
