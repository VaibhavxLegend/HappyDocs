"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOpenApi = generateOpenApi;
exports.serializeOpenApi = serializeOpenApi;
const yaml_1 = __importDefault(require("yaml"));
const pathUtils_1 = require("../utils/pathUtils");
function generateOpenApi(endpoints, config) {
    const paths = {};
    let hasBearerAuth = false;
    for (const endpoint of endpoints) {
        const path = (0, pathUtils_1.openApiPath)(endpoint.fullPath);
        const operation = {
            operationId: endpoint.id.replace(/[^A-Za-z0-9_]/g, "_"),
            tags: endpoint.tags,
            summary: endpoint.summary,
            description: endpoint.description,
            parameters: endpoint.parameters.map((parameter) => ({
                name: parameter.name,
                in: parameter.location,
                required: parameter.location === "path" ? true : parameter.required,
                description: parameter.description,
                schema: parameter.schema ?? schemaForParameter(parameter.type),
                example: parameter.example
            })),
            responses: Object.fromEntries(endpoint.responses.map((response) => [
                response.statusCode,
                {
                    description: response.description,
                    ...(response.contentType
                        ? {
                            content: {
                                [response.contentType]: {
                                    ...(response.schema ? { schema: response.schema } : {}),
                                    ...(response.example !== undefined ? { example: response.example } : {})
                                }
                            }
                        }
                        : {})
                }
            ])),
            "x-source-location": endpoint.source,
            "x-happydocs-confidence": endpoint.confidence,
            ...(endpoint.unresolvedItems.length
                ? { "x-happydocs-unresolved": endpoint.unresolvedItems }
                : {}),
            ...(endpoint.aiEnrichment?.accepted ? { "x-happydocs-ai-assisted": true } : {})
        };
        if (endpoint.requestBody) {
            operation.requestBody = {
                required: endpoint.requestBody.required,
                description: endpoint.requestBody.description,
                content: {
                    [endpoint.requestBody.contentType]: {
                        schema: endpoint.requestBody.schema,
                        ...(endpoint.requestBody.example !== undefined
                            ? { example: endpoint.requestBody.example }
                            : {})
                    }
                }
            };
        }
        if (endpoint.authentication) {
            hasBearerAuth ||= endpoint.authentication.type === "bearer";
            operation.security = [{ bearerAuth: [] }];
        }
        paths[path] ??= {};
        paths[path][endpoint.method] = removeUndefined(operation);
    }
    return {
        openapi: "3.1.0",
        info: {
            title: config.apiTitle,
            version: config.apiVersion,
            description: config.apiDescription
        },
        ...(config.baseUrl ? { servers: [{ url: config.baseUrl }] } : {}),
        paths,
        ...(hasBearerAuth
            ? {
                components: {
                    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
                }
            }
            : {})
    };
}
function serializeOpenApi(document, format) {
    return format === "json"
        ? `${JSON.stringify(document, null, 2)}\n`
        : yaml_1.default.stringify(document, { sortMapEntries: true });
}
function schemaForParameter(type) {
    if (/boolean/i.test(type))
        return { type: "boolean" };
    if (/number|int/i.test(type))
        return { type: "number" };
    return { type: "string" };
}
function removeUndefined(value) {
    if (Array.isArray(value))
        return value.map(removeUndefined);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, removeUndefined(item)]));
    }
    return value;
}
//# sourceMappingURL=openapiGenerator.js.map