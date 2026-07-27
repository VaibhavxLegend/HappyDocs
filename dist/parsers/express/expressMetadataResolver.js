"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpressMetadataResolver = void 0;
const ts_morph_1 = require("ts-morph");
const astUtils_1 = require("../../utils/astUtils");
/** Inspects handler ASTs for request access, JSDoc and common Express response calls. */
class ExpressMetadataResolver {
    resolve(candidate) {
        const args = candidate.args;
        const handlerExpression = args.at(-1);
        const handler = handlerExpression ? resolveHandler(handlerExpression) : undefined;
        const middleware = args
            .slice(0, -1)
            .map(middlewareName)
            .filter((name) => Boolean(name));
        const parameters = pathParameters(candidate.path ?? candidate.pathExpression);
        const fallback = {
            source: (0, astUtils_1.sourceLocation)(candidate.call),
            parameters,
            middleware,
            unresolvedItems: [],
            responses: []
        };
        if (!handler) {
            return { ...fallback, unresolvedItems: ["Route handler could not be resolved statically."] };
        }
        const handlerParameters = handler.getParameters();
        const requestName = handlerParameters[0]?.getName() ?? "req";
        const responseName = handlerParameters[1]?.getName() ?? "res";
        const requestMetadata = inspectRequest(handler, requestName);
        const responses = inspectResponses(handler, responseName);
        return {
            source: (0, astUtils_1.sourceLocation)(handler),
            summary: (0, astUtils_1.commentFor)(handler),
            description: (0, astUtils_1.commentFor)(handler),
            parameters: mergeParameters(parameters, requestMetadata.parameters),
            requestBody: requestMetadata.requestBody,
            responses: responses.length
                ? responses
                : [{ statusCode: "200", description: "Successful response" }],
            middleware,
            unresolvedItems: requestMetadata.unresolvedItems
        };
    }
}
exports.ExpressMetadataResolver = ExpressMetadataResolver;
function resolveHandler(expression) {
    if (isHandler(expression))
        return expression;
    if (!ts_morph_1.Node.isIdentifier(expression))
        return undefined;
    const declaration = expression.getDefinitions()[0]?.getDeclarationNode();
    if (!declaration)
        return undefined;
    if (ts_morph_1.Node.isFunctionDeclaration(declaration) || ts_morph_1.Node.isMethodDeclaration(declaration))
        return declaration;
    if (ts_morph_1.Node.isVariableDeclaration(declaration)) {
        const initializer = declaration.getInitializer();
        return initializer && isHandler(initializer) ? initializer : undefined;
    }
    return undefined;
}
function isHandler(node) {
    return (ts_morph_1.Node.isArrowFunction(node) ||
        ts_morph_1.Node.isFunctionExpression(node) ||
        ts_morph_1.Node.isFunctionDeclaration(node) ||
        ts_morph_1.Node.isMethodDeclaration(node));
}
function middlewareName(expression) {
    if (ts_morph_1.Node.isIdentifier(expression))
        return expression.getText();
    if (ts_morph_1.Node.isCallExpression(expression)) {
        const callee = expression.getExpression();
        return ts_morph_1.Node.isIdentifier(callee) ? `${callee.getText()}()` : expression.getText();
    }
    return ts_morph_1.Node.isPropertyAccessExpression(expression) ? expression.getText() : undefined;
}
function pathParameters(path) {
    return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
        name: match[1],
        location: "path",
        type: "string",
        required: true,
        schema: { type: "string" }
    }));
}
function inspectRequest(handler, requestName) {
    const parameters = [];
    const bodyProperties = {};
    let bodyAccessed = false;
    handler.forEachDescendant((node) => {
        if (!ts_morph_1.Node.isPropertyAccessExpression(node))
            return;
        const outerName = node.getName();
        const base = node.getExpression();
        if (!ts_morph_1.Node.isPropertyAccessExpression(base) ||
            !ts_morph_1.Node.isIdentifier(base.getExpression()) ||
            base.getExpression().getText() !== requestName)
            return;
        const location = base.getName() === "params" ? "path" : base.getName() === "query" ? "query" : undefined;
        if (location) {
            parameters.push({
                name: outerName,
                location,
                type: "string",
                required: location === "path",
                schema: { type: "string" }
            });
        }
        if (base.getName() === "body") {
            bodyAccessed = true;
            bodyProperties[outerName] = { type: "object", additionalProperties: true };
        }
    });
    handler.forEachDescendant((node) => {
        if (ts_morph_1.Node.isPropertyAccessExpression(node) &&
            ts_morph_1.Node.isIdentifier(node.getExpression()) &&
            node.getExpression().getText() === requestName &&
            node.getName() === "body")
            bodyAccessed = true;
    });
    const requestBody = bodyAccessed
        ? {
            required: true,
            contentType: "application/json",
            schema: {
                type: "object",
                properties: bodyProperties,
                additionalProperties: !Object.keys(bodyProperties).length
            }
        }
        : undefined;
    return { parameters: dedupeParameters(parameters), requestBody, unresolvedItems: [] };
}
function inspectResponses(handler, responseName) {
    const responses = [];
    handler.forEachDescendant((node) => {
        if (!ts_morph_1.Node.isCallExpression(node))
            return;
        const expression = node.getExpression();
        if (!ts_morph_1.Node.isPropertyAccessExpression(expression) ||
            !["json", "send"].includes(expression.getName()))
            return;
        const receiver = expression.getExpression();
        let statusCode = "200";
        if (ts_morph_1.Node.isIdentifier(receiver) && receiver.getText() !== responseName)
            return;
        if (ts_morph_1.Node.isCallExpression(receiver)) {
            const statusExpression = receiver.getExpression();
            if (!ts_morph_1.Node.isPropertyAccessExpression(statusExpression) ||
                statusExpression.getName() !== "status" ||
                !ts_morph_1.Node.isIdentifier(statusExpression.getExpression()) ||
                statusExpression.getExpression().getText() !== responseName)
                return;
            statusCode = String((0, astUtils_1.getNumericValue)(receiver.getArguments()[0]) ?? 200);
        }
        const body = node.getArguments()[0];
        responses.push({
            statusCode,
            description: statusCode.startsWith("2")
                ? "Successful response"
                : "Response returned by handler",
            contentType: expression.getName() === "json" ? "application/json" : "text/plain",
            schema: body && ts_morph_1.Node.isObjectLiteralExpression(body) ? schemaFromObject(body) : undefined,
            example: body ? (0, astUtils_1.getLiteralValue)(body) : undefined
        });
    });
    return [...new Map(responses.map((response) => [response.statusCode, response])).values()];
}
function schemaFromObject(object) {
    const properties = {};
    for (const property of object.getProperties()) {
        if (!ts_morph_1.Node.isPropertyAssignment(property))
            continue;
        const initializer = property.getInitializer();
        if (!initializer)
            continue;
        if (ts_morph_1.Node.isStringLiteral(initializer))
            properties[property.getName()] = { type: "string", example: initializer.getLiteralText() };
        else if (ts_morph_1.Node.isNumericLiteral(initializer))
            properties[property.getName()] = { type: "number", example: Number(initializer.getText()) };
        else if (initializer.getKind() === ts_morph_1.SyntaxKind.TrueKeyword ||
            initializer.getKind() === ts_morph_1.SyntaxKind.FalseKeyword)
            properties[property.getName()] = { type: "boolean" };
        else
            properties[property.getName()] = (0, astUtils_1.schemaFromTypeNode)(initializer.getType().getText() ? undefined : undefined, object.getSourceFile());
    }
    return { type: "object", properties };
}
function mergeParameters(first, second) {
    return [
        ...new Map([...first, ...second].map((parameter) => [
            `${parameter.location}:${parameter.name}`,
            parameter
        ])).values()
    ];
}
function dedupeParameters(parameters) {
    return mergeParameters([], parameters);
}
//# sourceMappingURL=expressMetadataResolver.js.map