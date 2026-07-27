"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NestMetadataResolver = void 0;
const ts_morph_1 = require("ts-morph");
const astUtils_1 = require("../../utils/astUtils");
class NestMetadataResolver {
    resolve(controller, method, httpMethod) {
        const operation = decorator(controller, "ApiOperation") ?? decorator(method, "ApiOperation");
        const operationObject = operation
            ?.getArguments()[0]
            ?.asKind(ts_morph_1.SyntaxKind.ObjectLiteralExpression);
        const summary = stringFrom((0, astUtils_1.objectValue)(operationObject, "summary")) ?? (0, astUtils_1.commentFor)(method);
        const description = stringFrom((0, astUtils_1.objectValue)(operationObject, "description")) ?? (0, astUtils_1.commentFor)(method);
        const parameterMetadata = method
            .getParameters()
            .map((parameter) => this.parameter(parameter))
            .filter(Boolean);
        const body = requestBody(parameterMetadata);
        const params = parameterMetadata.flatMap((result) => result.parameter ? [result.parameter] : []);
        const classMiddleware = middlewareFromDecorators(controller.getDecorators());
        const methodMiddleware = middlewareFromDecorators(method.getDecorators());
        const middleware = [...new Set([...classMiddleware, ...methodMiddleware])];
        const status = httpStatus(method) ?? (httpMethod === "post" ? 201 : 200);
        const responses = apiResponses(method, status);
        return {
            summary,
            description,
            parameters: dedupe(params),
            requestBody: body,
            responses: responses.length
                ? responses
                : [{ statusCode: String(status), description: "Successful response" }],
            middleware,
            authentication: middleware.some((item) => /auth|guard|jwt/i.test(item))
                ? { type: "bearer", description: "Inferred from NestJS guard" }
                : undefined,
            unresolvedItems: []
        };
    }
    parameter(parameter) {
        const sourceFile = parameter.getSourceFile();
        for (const current of parameter.getDecorators()) {
            const name = current.getName();
            const argument = current.getArguments()[0];
            const key = stringFrom(argument) ?? parameter.getName();
            const type = parameter.getTypeNode()?.getText() ?? parameter.getType().getText(parameter);
            const schema = (0, astUtils_1.schemaFromTypeNode)(parameter.getTypeNode(), sourceFile);
            if (name === "Param")
                return { parameter: { name: key, location: "path", type, required: true, schema } };
            if (name === "Query")
                return {
                    parameter: {
                        name: key,
                        location: "query",
                        type,
                        required: !parameter.hasQuestionToken(),
                        schema
                    }
                };
            if (name === "Headers" || name === "Header")
                return {
                    parameter: {
                        name: key,
                        location: "header",
                        type,
                        required: !parameter.hasQuestionToken(),
                        schema
                    }
                };
            if (name === "Body")
                return {
                    bodyKey: stringFrom(argument),
                    schema,
                    type,
                    required: !parameter.hasQuestionToken()
                };
        }
        return undefined;
    }
}
exports.NestMetadataResolver = NestMetadataResolver;
function requestBody(results) {
    const bodies = results.filter((result) => result.schema);
    if (!bodies.length)
        return undefined;
    const whole = bodies.find((result) => !result.bodyKey);
    if (whole)
        return {
            required: whole.required ?? true,
            contentType: "application/json",
            schema: whole.schema
        };
    const properties = Object.fromEntries(bodies.map((result) => [result.bodyKey, result.schema]));
    return {
        required: bodies.some((result) => result.required),
        contentType: "application/json",
        schema: {
            type: "object",
            properties,
            required: bodies.filter((result) => result.required).map((result) => result.bodyKey)
        }
    };
}
function apiResponses(method, defaultStatus) {
    return method
        .getDecorators()
        .filter((item) => item.getName() === "ApiResponse")
        .map((decorator) => {
        const options = decorator.getArguments()[0]?.asKind(ts_morph_1.SyntaxKind.ObjectLiteralExpression);
        const status = (0, astUtils_1.getNumericValue)((0, astUtils_1.objectValue)(options, "status")) ?? defaultStatus;
        const description = stringFrom((0, astUtils_1.objectValue)(options, "description")) ??
            (status >= 400 ? "Error response" : "Successful response");
        const typeExpression = (0, astUtils_1.objectValue)(options, "type");
        return {
            statusCode: String(status),
            description,
            contentType: "application/json",
            schema: schemaFromResponseType(typeExpression)
        };
    });
}
function schemaFromResponseType(expression) {
    if (!expression || !ts_morph_1.Node.isIdentifier(expression))
        return undefined;
    const declaration = expression.getDefinitions()[0]?.getDeclarationNode();
    const sourceFile = declaration?.getSourceFile() ?? expression.getSourceFile();
    return (0, astUtils_1.schemaFromTypeText)(expression.getText(), sourceFile);
}
function middlewareFromDecorators(decorators) {
    return decorators
        .filter((item) => item.getName() === "UseGuards" || item.getName() === "UseInterceptors")
        .flatMap((item) => item.getArguments().map((argument) => argument.getText()));
}
function httpStatus(method) {
    const httpCode = decorator(method, "HttpCode");
    return (0, astUtils_1.getNumericValue)(httpCode?.getArguments()[0]);
}
function decorator(node, name) {
    return node.getDecorators().find((item) => item.getName() === name);
}
function stringFrom(expression) {
    const result = (0, astUtils_1.evaluateString)(expression);
    return result.resolved ? result.value : undefined;
}
function dedupe(parameters) {
    return [
        ...new Map(parameters.map((parameter) => [`${parameter.location}:${parameter.name}`, parameter])).values()
    ];
}
//# sourceMappingURL=nestMetadataResolver.js.map