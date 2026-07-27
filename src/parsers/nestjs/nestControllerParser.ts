import { type ClassDeclaration } from "ts-morph";
import type { ApiEndpoint, HttpMethod, ParserContext, ParserResult } from "../../core/types";
import { evaluateString, sourceLocation } from "../../utils/astUtils";
import { normalizeRoutePath, tagFromPath } from "../../utils/pathUtils";
import type { BaseParser } from "../baseParser";
import { NestMetadataResolver } from "./nestMetadataResolver";

const decoratorsToMethods: Record<string, HttpMethod> = {
  Get: "get",
  Post: "post",
  Put: "put",
  Patch: "patch",
  Delete: "delete",
  Head: "head",
  Options: "options"
};

export class NestControllerParser implements BaseParser {
  readonly framework = "nestjs" as const;

  parse(context: ParserContext): ParserResult {
    const endpoints: ApiEndpoint[] = [];
    const diagnostics: ParserResult["diagnostics"] = [];
    const resolver = new NestMetadataResolver();
    for (const sourceFile of context.sourceFiles) {
      for (const controller of sourceFile.getClasses()) {
        const controllerDecorator = controller
          .getDecorators()
          .find((decorator) => decorator.getName() === "Controller");
        if (!controllerDecorator) continue;
        const controllerPath = evaluateString(controllerDecorator.getArguments()[0]);
        const controllerTags = tags(controller);
        for (const method of controller.getMethods()) {
          for (const decorator of method.getDecorators()) {
            const httpMethod = decoratorsToMethods[decorator.getName()];
            if (!httpMethod) continue;
            const methodPath = evaluateString(decorator.getArguments()[0]);
            const fullPath = normalizeRoutePath(
              controllerPath.value ?? controllerPath.expression,
              methodPath.value ?? methodPath.expression
            );
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
                : [tagFromPath(controllerPath.value ?? controllerPath.expression)],
              source: sourceLocation(method),
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

function tags(controller: ClassDeclaration): string[] {
  const decorator = controller.getDecorators().find((item) => item.getName() === "ApiTags");
  if (!decorator) return [];
  return decorator
    .getArguments()
    .map((argument) => evaluateString(argument))
    .filter((item) => item.resolved && item.value)
    .map((item) => item.value!);
}
