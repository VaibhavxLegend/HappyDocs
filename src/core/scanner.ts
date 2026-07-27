import * as vscode from "vscode";
import { Project, ScriptKind, ts } from "ts-morph";
import { getConfig } from "./config";
import type { ApiEndpoint, ScanDiagnostic, ScanResult } from "./types";
import { createParsers } from "../parsers/parserFactory";
import { sourceGlobQuery } from "../utils/fileUtils";

interface CachedFile {
  modified: number;
  size: number;
  text: string;
}

/**
 * Parses only changed workspace files and delegates AST traversal to framework adapters.
 * Parsed source files are short-lived for each scan, avoiding a persistent compiler graph for large repositories.
 */
export class ProjectScanner {
  private readonly cache = new Map<string, CachedFile>();
  private readonly parseCache = new Map<
    string,
    { fingerprint: string; endpoints: ApiEndpoint[]; diagnostics: ScanDiagnostic[] }
  >();

  clearCache(): void {
    this.cache.clear();
    this.parseCache.clear();
  }

  async scan(
    onProgress?: (message: string, increment?: number) => void,
    token?: vscode.CancellationToken
  ): Promise<ScanResult> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length)
      throw new Error("Open a workspace folder before scanning for API endpoints.");

    const allEndpoints: ApiEndpoint[] = [];
    const diagnostics: ScanDiagnostic[] = [];
    let scannedFiles = 0;
    let cachedFiles = 0;

    for (const folder of folders) {
      if (token?.isCancellationRequested) break;
      const config = getConfig(folder.uri);
      const folderEndpointStart = allEndpoints.length;
      const folderDiagnosticStart = diagnostics.length;
      const { include, exclude } = sourceGlobQuery(config.include, config.exclude);
      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, include),
        exclude,
        config.maxFiles + 1
      );
      const candidates = uris.slice(0, config.maxFiles);
      const signatures = await Promise.all(
        candidates.map(async (uri) => {
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            return `${uri.toString()}:${stat.mtime}:${stat.size}`;
          } catch {
            return `${uri.toString()}:unavailable`;
          }
        })
      );
      const cacheKey = `${folder.uri.toString()}:${JSON.stringify(config.frameworks)}`;
      const fingerprint = signatures.join("|");
      const parsed = this.parseCache.get(cacheKey);
      if (parsed?.fingerprint === fingerprint) {
        allEndpoints.push(...parsed.endpoints);
        diagnostics.push(...parsed.diagnostics);
        cachedFiles += candidates.length;
        onProgress?.(`Reused cached endpoint results for ${folder.name}.`);
        continue;
      }
      if (uris.length > config.maxFiles) {
        diagnostics.push({
          severity: "warning",
          message: `Stopped after ${config.maxFiles} files. Increase hybridApiDocs.maxFiles to scan more.`,
          filePath: folder.uri.fsPath
        });
      }
      onProgress?.(`Reading ${candidates.length} source files in ${folder.name}…`);
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: { allowJs: true, checkJs: false, target: 9, module: 1, skipLibCheck: true }
      });

      await Promise.all(
        candidates.map(async (uri) => {
          if (token?.isCancellationRequested) return;
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            const cached = this.cache.get(uri.toString());
            let text: string;
            if (cached && cached.modified === stat.mtime && cached.size === stat.size) {
              text = cached.text;
              cachedFiles += 1;
            } else {
              text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
              this.cache.set(uri.toString(), { modified: stat.mtime, size: stat.size, text });
              scannedFiles += 1;
            }
            const kind = uri.path.endsWith(".tsx")
              ? ScriptKind.TSX
              : uri.path.endsWith(".jsx")
                ? ScriptKind.JSX
                : uri.path.endsWith(".js")
                  ? ScriptKind.JS
                  : ScriptKind.TS;
            project.createSourceFile(uri.fsPath, text, { overwrite: true, scriptKind: kind });
          } catch (error) {
            diagnostics.push({
              severity: "error",
              message: `Could not read file: ${safeError(error)}`,
              filePath: uri.fsPath,
              source: "HappyDocs"
            });
          }
        })
      );

      const sourceFiles = project.getSourceFiles();
      for (const sourceFile of sourceFiles) {
        const parsedFile = ts.createSourceFile(
          sourceFile.getFilePath(),
          sourceFile.getFullText(),
          ts.ScriptTarget.Latest,
          true
        );
        const parseDiagnostics = (
          parsedFile as unknown as { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }
        ).parseDiagnostics;
        for (const diagnostic of parseDiagnostics) {
          diagnostics.push({
            severity: "warning",
            message: `Syntax recovery: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
            filePath: sourceFile.getFilePath(),
            line:
              diagnostic.start === undefined
                ? undefined
                : sourceFile.getLineAndColumnAtPos(diagnostic.start).line,
            source: "HappyDocs"
          });
        }
      }

      onProgress?.(`Extracting API endpoints from ${sourceFiles.length} files…`);
      for (const parser of createParsers(config)) {
        if (token?.isCancellationRequested) break;
        try {
          const result = parser.parse({ workspaceUri: folder.uri, sourceFiles, config });
          allEndpoints.push(...result.endpoints);
          diagnostics.push(...result.diagnostics);
        } catch (error) {
          diagnostics.push({
            severity: "error",
            message: `${parser.framework} parser failed safely: ${safeError(error)}`,
            source: "HappyDocs"
          });
        }
      }
      diagnostics.push(...frameworkWarnings(sourceFiles, config.frameworks));
      this.parseCache.set(cacheKey, {
        fingerprint,
        endpoints: allEndpoints.slice(folderEndpointStart),
        diagnostics: diagnostics.slice(folderDiagnosticStart)
      });
    }
    return { endpoints: allEndpoints, diagnostics, scannedFiles, cachedFiles };
  }
}

function frameworkWarnings(
  sourceFiles: import("ts-morph").SourceFile[],
  enabled: Array<"express" | "nestjs">
): ScanDiagnostic[] {
  const warnings: ScanDiagnostic[] = [];
  for (const sourceFile of sourceFiles) {
    const text = sourceFile.getFullText();
    if (!enabled.includes("nestjs") && /@Controller\s*\(/.test(text)) {
      warnings.push({
        severity: "warning",
        message: "NestJS controller decorators were found, but the NestJS adapter is disabled.",
        filePath: sourceFile.getFilePath(),
        source: "HappyDocs"
      });
    }
    if (!enabled.includes("express") && /\b(express|Router)\b/.test(text)) {
      warnings.push({
        severity: "warning",
        message: "Express-like source was found, but the Express adapter is disabled.",
        filePath: sourceFile.getFilePath(),
        source: "HappyDocs"
      });
    }
    if (/\bfastify\b|\bFastify\b|\bnew\s+Koa\b/.test(text)) {
      warnings.push({
        severity: "warning",
        message:
          "A Fastify or Koa pattern was found. This framework is not supported by the current HappyDocs adapters.",
        filePath: sourceFile.getFilePath(),
        source: "HappyDocs"
      });
    }
  }
  return warnings;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown scanner error";
}
