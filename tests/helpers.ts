import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Project } from "ts-morph";
import type { HappyDocsConfig, ParserContext } from "../src/core/types";

export const testConfig: HappyDocsConfig = {
  include: ["**/*.{ts,js}"],
  exclude: [],
  frameworks: ["express", "nestjs"],
  outputDirectory: "docs/api",
  openapiFormat: "yaml",
  apiTitle: "Test API",
  apiVersion: "1.0.0",
  apiDescription: "Test documentation",
  baseUrl: "http://localhost:3000",
  enableAiEnrichment: false,
  aiProvider: "openai",
  maxFiles: 50
};

export function inMemoryProject(files: Record<string, string>): ParserContext {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, experimentalDecorators: true }
  });
  for (const [filePath, text] of Object.entries(files)) project.createSourceFile(filePath, text);
  return { sourceFiles: project.getSourceFiles(), config: testConfig };
}

export function fixture(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8");
}
