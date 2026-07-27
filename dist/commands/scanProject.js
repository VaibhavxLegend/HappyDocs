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
exports.scanProject = scanProject;
const vscode = __importStar(require("vscode"));
async function scanProject(scanner, registry, diagnostics, clearCache = false) {
    if (clearCache)
        scanner.clearCache();
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "HappyDocs: scanning API source",
        cancellable: true
    }, async (progress, token) => {
        const result = await scanner.scan((message) => progress.report({ message }), token);
        registry.replace(result.endpoints);
        diagnostics.publish(result.diagnostics);
        const detail = `${result.endpoints.length} endpoint${result.endpoints.length === 1 ? "" : "s"}; ${result.scannedFiles} read, ${result.cachedFiles} cached.`;
        void vscode.window.showInformationMessage(`HappyDocs scan complete: ${detail}`);
    });
}
//# sourceMappingURL=scanProject.js.map