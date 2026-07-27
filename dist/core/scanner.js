"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectScanner = void 0;
const vscode = __importStar(require("vscode"));
const ts_morph_1 = require("ts-morph");
const config_1 = require("./config");
const parserFactory_1 = require("../parsers/parserFactory");
const fileUtils_1 = require("../utils/fileUtils");
/**
 * Parses only changed workspace files and delegates AST traversal to framework adapters.
 * Parsed source files are short-lived for each scan, avoiding a persistent compiler graph for large repositories.
 */
class ProjectScanner {
    cache = new Map();
    parseCache = new Map();
    clearCache() {
        this.cache.clear();
        this.parseCache.clear();
    }
    async scan(onProgress, token) {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length)
            throw new Error("Open a workspace folder before scanning for API endpoints.");
        const allEndpoints = [];
        const diagnostics = [];
        let scannedFiles = 0;
        let cachedFiles = 0;
        for (const folder of folders) {
            if (token?.isCancellationRequested)
                break;
            const config = (0, config_1.getConfig)(folder.uri);
            const folderEndpointStart = allEndpoints.length;
            const folderDiagnosticStart = diagnostics.length;
            const { include, exclude } = (0, fileUtils_1.sourceGlobQuery)(config.include, config.exclude);
            const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, include), exclude, config.maxFiles + 1);
            const candidates = uris.slice(0, config.maxFiles);
            const signatures = await Promise.all(candidates.map(async (uri) => {
                try {
                    const stat = await vscode.workspace.fs.stat(uri);
                    return `${uri.toString()}:${stat.mtime}:${stat.size}`;
                }
                catch {
                    return `${uri.toString()}:unavailable`;
                }
            }));
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
            const project = new ts_morph_1.Project({
                useInMemoryFileSystem: true,
                compilerOptions: { allowJs: true, checkJs: false, target: 9, module: 1, skipLibCheck: true }
            });
            await Promise.all(candidates.map(async (uri) => {
                if (token?.isCancellationRequested)
                    return;
                try {
                    const stat = await vscode.workspace.fs.stat(uri);
                    const cached = this.cache.get(uri.toString());
                    let text;
                    if (cached && cached.modified === stat.mtime && cached.size === stat.size) {
                        text = cached.text;
                        cachedFiles += 1;
                    }
                    else {
                        text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
                        this.cache.set(uri.toString(), { modified: stat.mtime, size: stat.size, text });
                        scannedFiles += 1;
                    }
                    const kind = uri.path.endsWith(".tsx")
                        ? ts_morph_1.ScriptKind.TSX
                        : uri.path.endsWith(".jsx")
                            ? ts_morph_1.ScriptKind.JSX
                            : uri.path.endsWith(".js")
                                ? ts_morph_1.ScriptKind.JS
                                : ts_morph_1.ScriptKind.TS;
                    project.createSourceFile(uri.fsPath, text, { overwrite: true, scriptKind: kind });
                }
                catch (error) {
                    diagnostics.push({
                        severity: "error",
                        message: `Could not read file: ${safeError(error)}`,
                        filePath: uri.fsPath,
                        source: "HappyDocs"
                    });
                }
            }));
            const sourceFiles = project.getSourceFiles();
            for (const sourceFile of sourceFiles) {
                const parsedFile = ts_morph_1.ts.createSourceFile(sourceFile.getFilePath(), sourceFile.getFullText(), ts_morph_1.ts.ScriptTarget.Latest, true);
                const parseDiagnostics = parsedFile.parseDiagnostics;
                for (const diagnostic of parseDiagnostics) {
                    diagnostics.push({
                        severity: "warning",
                        message: `Syntax recovery: ${ts_morph_1.ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
                        filePath: sourceFile.getFilePath(),
                        line: diagnostic.start === undefined
                            ? undefined
                            : sourceFile.getLineAndColumnAtPos(diagnostic.start).line,
                        source: "HappyDocs"
                    });
                }
            }
            onProgress?.(`Extracting API endpoints from ${sourceFiles.length} files…`);
            for (const parser of (0, parserFactory_1.createParsers)(config)) {
                if (token?.isCancellationRequested)
                    break;
                try {
                    const result = parser.parse({ workspaceUri: folder.uri, sourceFiles, config });
                    allEndpoints.push(...result.endpoints);
                    diagnostics.push(...result.diagnostics);
                }
                catch (error) {
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
exports.ProjectScanner = ProjectScanner;
function frameworkWarnings(sourceFiles, enabled) {
    const warnings = [];
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
                message: "A Fastify or Koa pattern was found. This framework is not supported by the current HappyDocs adapters.",
                filePath: sourceFile.getFilePath(),
                source: "HappyDocs"
            });
        }
    }
    return warnings;
}
function safeError(error) {
    return error instanceof Error ? error.message : "Unknown scanner error";
}
//# sourceMappingURL=scanner.js.map