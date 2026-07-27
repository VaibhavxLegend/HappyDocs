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
exports.exportOpenApi = exportOpenApi;
exports.exportMarkdown = exportMarkdown;
const vscode = __importStar(require("vscode"));
const config_1 = require("../core/config");
const markdownGenerator_1 = require("../generators/markdownGenerator");
const openapiGenerator_1 = require("../generators/openapiGenerator");
const fileUtils_1 = require("../utils/fileUtils");
async function exportOpenApi(registry) {
    const root = workspaceRoot();
    const config = (0, config_1.getConfig)(root);
    const filename = config.openapiFormat === "json" ? "openapi.json" : "openapi.yaml";
    const content = (0, openapiGenerator_1.serializeOpenApi)((0, openapiGenerator_1.generateOpenApi)(registry.all(), config), config.openapiFormat);
    const uri = await (0, fileUtils_1.writeWorkspaceFile)(root, `${config.outputDirectory}/${filename}`, content);
    await revealExport(uri, "OpenAPI");
}
async function exportMarkdown(registry) {
    const root = workspaceRoot();
    const config = (0, config_1.getConfig)(root);
    const content = (0, markdownGenerator_1.generateMarkdown)(registry.all(), config, root.fsPath);
    const uri = await (0, fileUtils_1.writeWorkspaceFile)(root, `${config.outputDirectory}/API_DOCUMENTATION.md`, content);
    await revealExport(uri, "Markdown documentation");
}
function workspaceRoot() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder)
        throw new Error("Open a workspace folder before exporting documentation.");
    return folder.uri;
}
async function revealExport(uri, label) {
    const choice = await vscode.window.showInformationMessage(`HappyDocs exported ${label}.`, "Open");
    if (choice === "Open")
        await vscode.commands.executeCommand("vscode.open", uri);
}
//# sourceMappingURL=exportDocs.js.map