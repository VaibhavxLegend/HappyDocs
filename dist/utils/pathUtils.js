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
exports.normalizeRoutePath = normalizeRoutePath;
exports.openApiPath = openApiPath;
exports.relativeTo = relativeTo;
exports.tagFromPath = tagFromPath;
const path = __importStar(require("node:path"));
function normalizeRoutePath(...parts) {
    const joined = parts
        .filter((part) => Boolean(part))
        .join("/")
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/");
    const normalized = `/${joined}`.replace(/\/+/g, "/");
    return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}
function openApiPath(route) {
    return route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}
function relativeTo(root, filePath) {
    const relative = path.relative(root, filePath);
    return relative || path.basename(filePath);
}
function tagFromPath(route) {
    const segment = route.split("/").find((item) => item && !item.startsWith(":"));
    return segment
        ? segment.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
        : "Default";
}
//# sourceMappingURL=pathUtils.js.map