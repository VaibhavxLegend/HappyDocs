"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NestControllerParser = void 0;
const astUtils_1 = require("../../utils/astUtils");
const pathUtils_1 = require("../../utils/pathUtils");
const nestMetadataResolver_1 = require("./nestMetadataResolver");
const decoratorsToMethods = {
    Get: "get",
    Post: "post",
    Put: "put",
    Patch: "patch",
    Delete: "delete",
    Head: "head",
    Options: "options"
};
class NestControllerParser {
    framework = "nestjs";
    parse(context) {
        const endpoints = [];
        const diagnostics = [];
        const resolver = new nestMetadataResolver_1.NestMetadataResolver();
        for (const sourceFile of context.sourceFiles) {
            for (const controller of sourceFile.getClasses()) {
                const controllerDecorator = controller
                    .getDecorators()
                    .find((decorator) => decorator.getName() === "Controller");
                if (!controllerDecorator)
                    continue;
                const controllerPath = (0, astUtils_1.evaluateString)(controllerDecorator.getArguments()[0]);
                const controllerTags = tags(controller);
                for (const method of controller.getMethods()) {
                    for (const decorator of method.getDecorators()) {
                        const httpMethod = decoratorsToMethods[decorator.getName()];
                        if (!httpMethod)
                            continue;
                        const methodPath = (0, astUtils_1.evaluateString)(decorator.getArguments()[0]);
                        const fullPath = (0, pathUtils_1.normalizeRoutePath)(controllerPath.value ?? controllerPath.expression, methodPath.value ?? methodPath.expression);
                        const metadata = resolver.resolve(controller, method, httpMethod);
                        const dynamic = !controllerPath.resolved || !methodPath.resolved;
                        endpoints.push({
                            id: `nestjs:${sourceFile.getFilePath()}:${method.getStart()}:${httpMethod}`,
                            framework: "nestjs",
                            method: httpMethod,
                            path: methodPath.value ?? methodPath.expression,
                            fullPath,
                            summary: metadata.summary,
                            description: metadata.description,
                            tags: controllerTags.length
                                ? controllerTags
                                : [(0, pathUtils_1.tagFromPath)(controllerPath.value ?? controllerPath.expression)],
                            source: (0, astUtils_1.sourceLocation)(method),
                            parameters: metadata.parameters,
                            requestBody: metadata.requestBody,
                            responses: metadata.responses,
                            authentication: metadata.authentication,
                            middleware: metadata.middleware,
                            confidence: dynamic ? "low" : "high",
                            unresolvedItems: [
                                ...metadata.unresolvedItems,
                                ...(!controllerPath.resolved
                                    ? [`Dynamic controller path: ${controllerPath.expression}`]
                                    : []),
                                ...(!methodPath.resolved ? [`Dynamic method path: ${methodPath.expression}`] : [])
                            ]
                        });
                    }
                }
            }
        }
        return { endpoints, diagnostics };
    }
}
exports.NestControllerParser = NestControllerParser;
function tags(controller) {
    const decorator = controller.getDecorators().find((item) => item.getName() === "ApiTags");
    if (!decorator)
        return [];
    return decorator
        .getArguments()
        .map((argument) => (0, astUtils_1.evaluateString)(argument))
        .filter((item) => item.resolved && item.value)
        .map((item) => item.value);
}
//# sourceMappingURL=nestControllerParser.js.map