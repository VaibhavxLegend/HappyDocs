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
exports.EndpointRegistry = void 0;
const vscode = __importStar(require("vscode"));
const endpointDeduplicator_1 = require("./endpointDeduplicator");
class EndpointRegistry {
    endpoints = new Map();
    emitter = new vscode.EventEmitter();
    onDidChange = this.emitter.event;
    replace(endpoints) {
        this.endpoints.clear();
        for (const endpoint of (0, endpointDeduplicator_1.deduplicateEndpoints)(endpoints))
            this.endpoints.set(`${endpoint.method}:${endpoint.fullPath}`, endpoint);
        this.emitter.fire();
    }
    add(endpoint) {
        const key = `${endpoint.method}:${endpoint.fullPath}`;
        this.endpoints.set(key, (0, endpointDeduplicator_1.deduplicateEndpoints)([this.endpoints.get(key), endpoint].filter((value) => Boolean(value)))[0]);
    }
    all() {
        return [...this.endpoints.values()].sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));
    }
    get(id) {
        return this.all().find((endpoint) => endpoint.id === id);
    }
    update(endpoint) {
        this.endpoints.set(`${endpoint.method}:${endpoint.fullPath}`, endpoint);
        this.emitter.fire();
    }
    clear() {
        this.endpoints.clear();
        this.emitter.fire();
    }
    dispose() {
        this.emitter.dispose();
    }
}
exports.EndpointRegistry = EndpointRegistry;
//# sourceMappingURL=endpointRegistry.js.map