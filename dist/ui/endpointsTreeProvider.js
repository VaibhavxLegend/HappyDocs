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
exports.EndpointNode = exports.EndpointsTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class EndpointsTreeProvider {
    registry;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    subscription;
    constructor(registry) {
        this.registry = registry;
        this.subscription = registry.onDidChange(() => this.refresh());
    }
    refresh() {
        this.emitter.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element instanceof EndpointNode)
            return [];
        if (element instanceof GroupNode)
            return element.endpoints.map((endpoint) => new EndpointNode(endpoint));
        const groups = new Map();
        for (const endpoint of this.registry.all()) {
            const tag = endpoint.tags[0] ?? "Default";
            groups.set(tag, [...(groups.get(tag) ?? []), endpoint]);
        }
        if (!groups.size)
            return [new GroupNode("No scan results — run “Scan Project”", [])];
        return [...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([tag, endpoints]) => new GroupNode(tag, endpoints));
    }
    dispose() {
        this.subscription.dispose();
        this.emitter.dispose();
    }
}
exports.EndpointsTreeProvider = EndpointsTreeProvider;
class GroupNode extends vscode.TreeItem {
    label;
    endpoints;
    constructor(label, endpoints) {
        super(label, endpoints.length
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.endpoints = endpoints;
        this.description = endpoints.length ? `${endpoints.length}` : undefined;
        this.iconPath = new vscode.ThemeIcon("folder-library");
    }
}
class EndpointNode extends vscode.TreeItem {
    endpoint;
    constructor(endpoint) {
        super(`${endpoint.method.toUpperCase()} ${endpoint.fullPath}`, vscode.TreeItemCollapsibleState.None);
        this.endpoint = endpoint;
        this.contextValue = "happyDocs.endpoint";
        this.description =
            endpoint.confidence === "high" ? undefined : `${endpoint.confidence} confidence`;
        this.tooltip = `${endpoint.framework} • ${endpoint.source.filePath}:${endpoint.source.line}`;
        this.iconPath = new vscode.ThemeIcon(iconFor(endpoint.method));
        this.command = {
            command: "vscode.open",
            title: "Open endpoint source",
            arguments: [
                vscode.Uri.file(endpoint.source.filePath),
                {
                    selection: new vscode.Range(endpoint.source.line - 1, endpoint.source.column - 1, endpoint.source.line - 1, endpoint.source.column)
                }
            ]
        };
    }
}
exports.EndpointNode = EndpointNode;
function iconFor(method) {
    if (method === "get")
        return "arrow-down";
    if (method === "post")
        return "add";
    if (method === "delete")
        return "trash";
    return "edit";
}
//# sourceMappingURL=endpointsTreeProvider.js.map