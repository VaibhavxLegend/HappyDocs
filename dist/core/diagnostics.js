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
exports.DiagnosticsReporter = void 0;
const vscode = __importStar(require("vscode"));
class DiagnosticsReporter {
    collection = vscode.languages.createDiagnosticCollection("HappyDocs");
    publish(diagnostics) {
        this.collection.clear();
        const grouped = new Map();
        for (const item of diagnostics) {
            if (!item.filePath)
                continue;
            const range = new vscode.Range(Math.max((item.line ?? 1) - 1, 0), 0, Math.max((item.line ?? 1) - 1, 0), 1);
            const diagnostic = new vscode.Diagnostic(range, item.message, toSeverity(item.severity));
            diagnostic.source = item.source ?? "HappyDocs";
            const existing = grouped.get(item.filePath) ?? [];
            existing.push(diagnostic);
            grouped.set(item.filePath, existing);
        }
        for (const [filePath, items] of grouped)
            this.collection.set(vscode.Uri.file(filePath), items);
    }
    dispose() {
        this.collection.dispose();
    }
}
exports.DiagnosticsReporter = DiagnosticsReporter;
function toSeverity(severity) {
    if (severity === "error")
        return vscode.DiagnosticSeverity.Error;
    if (severity === "warning")
        return vscode.DiagnosticSeverity.Warning;
    return vscode.DiagnosticSeverity.Information;
}
//# sourceMappingURL=diagnostics.js.map