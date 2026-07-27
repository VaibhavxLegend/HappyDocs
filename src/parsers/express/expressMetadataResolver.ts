import {
  Node,
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type MethodDeclaration,
  type ObjectLiteralExpression,
  SyntaxKind
} from "ts-morph";
import type { ApiParameter, ApiResponse, ApiSchema, RequestBodyMetadata } from "../../core/types";
import {
  commentFor,
  getLiteralValue,
  getNumericValue,
  schemaFromTypeNode,
  sourceLocation
} from "../../utils/astUtils";
import type { ExpressRouteCandidate } from "./expressRouteExtractor";

type HandlerNode = ArrowFunction | FunctionExpression | FunctionDeclaration | MethodDeclaration;

export interface ExpressHandlerMetadata {
  source: ReturnType<typeof sourceLocation>;
  summary?: string;
  description?: string;
  parameters: ApiParameter[];
  requestBody?: RequestBodyMetadata;
  responses: ApiResponse[];
  middleware: string[];
  unresolvedItems: string[];
}

/** Inspects handler ASTs for request access, JSDoc and common Express response calls. */
export class ExpressMetadataResolver {
  resolve(candidate: ExpressRouteCandidate): ExpressHandlerMetadata {
    const args = candidate.args;
    const handlerExpression = args.at(-1);
    const handler = handlerExpression ? resolveHandler(handlerExpression) : undefined;
    const middleware = args
      .slice(0, -1)
      .map(middlewareName)
      .filter((name): name is string => Boolean(name));
    const parameters = pathParameters(candidate.path ?? candidate.pathExpression);
    const fallback = {
      source: sourceLocation(candidate.call),
      parameters,
      middleware,
      unresolvedItems: [] as string[],
      responses: [] as ApiResponse[]
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
      source: sourceLocation(handler),
      summary: commentFor(handler),
      description: commentFor(handler),
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

function resolveHandler(expression: Node): HandlerNode | undefined {
  if (isHandler(expression)) return expression;
  if (!Node.isIdentifier(expression)) return undefined;
  const declaration = expression.getDefinitions()[0]?.getDeclarationNode();
  if (!declaration) return undefined;
  if (Node.isFunctionDeclaration(declaration) || Node.isMethodDeclaration(declaration))
    return declaration;
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer && isHandler(initializer) ? initializer : undefined;
  }
  return undefined;
}

function isHandler(node: Node): node is HandlerNode {
  return (
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isMethodDeclaration(node)
  );
}

function middlewareName(expression: Node): string | undefined {
  if (Node.isIdentifier(expression)) return expression.getText();
  if (Node.isCallExpression(expression)) {
    const callee = expression.getExpression();
    return Node.isIdentifier(callee) ? `${callee.getText()}()` : expression.getText();
  }
  return Node.isPropertyAccessExpression(expression) ? expression.getText() : undefined;
}

function pathParameters(path: string): ApiParameter[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1],
    location: "path",
    type: "string",
    required: true,
    schema: { type: "string" }
  }));
}

function inspectRequest(
  handler: HandlerNode,
  requestName: string
): { parameters: ApiParameter[]; requestBody?: RequestBodyMetadata; unresolvedItems: string[] } {
  const parameters: ApiParameter[] = [];
  const bodyProperties: Record<string, ApiSchema> = {};
  let bodyAccessed = false;
  handler.forEachDescendant((node) => {
    if (!Node.isPropertyAccessExpression(node)) return;
    const outerName = node.getName();
    const base = node.getExpression();
    if (
      !Node.isPropertyAccessExpression(base) ||
      !Node.isIdentifier(base.getExpression()) ||
      base.getExpression().getText() !== requestName
    )
      return;
    const location =
      base.getName() === "params" ? "path" : base.getName() === "query" ? "query" : undefined;
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
    if (
      Node.isPropertyAccessExpression(node) &&
      Node.isIdentifier(node.getExpression()) &&
      node.getExpression().getText() === requestName &&
      node.getName() === "body"
    )
      bodyAccessed = true;
  });
  const requestBody: RequestBodyMetadata | undefined = bodyAccessed
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

function inspectResponses(handler: HandlerNode, responseName: string): ApiResponse[] {
  const responses: ApiResponse[] = [];
  handler.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const expression = node.getExpression();
    if (
      !Node.isPropertyAccessExpression(expression) ||
      !["json", "send"].includes(expression.getName())
    )
      return;
    const receiver = expression.getExpression();
    let statusCode = "200";
    if (Node.isIdentifier(receiver) && receiver.getText() !== responseName) return;
    if (Node.isCallExpression(receiver)) {
      const statusExpression = receiver.getExpression();
      if (
        !Node.isPropertyAccessExpression(statusExpression) ||
        statusExpression.getName() !== "status" ||
        !Node.isIdentifier(statusExpression.getExpression()) ||
        statusExpression.getExpression().getText() !== responseName
      )
        return;
      statusCode = String(getNumericValue(receiver.getArguments()[0]) ?? 200);
    }
    const body = node.getArguments()[0];
    responses.push({
      statusCode,
      description: statusCode.startsWith("2")
        ? "Successful response"
        : "Response returned by handler",
      contentType: expression.getName() === "json" ? "application/json" : "text/plain",
      schema: body && Node.isObjectLiteralExpression(body) ? schemaFromObject(body) : undefined,
      example: body ? getLiteralValue(body) : undefined
    });
  });
  return [...new Map(responses.map((response) => [response.statusCode, response])).values()];
}

function schemaFromObject(object: ObjectLiteralExpression): ApiSchema {
  const properties: Record<string, ApiSchema> = {};
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue;
    const initializer = property.getInitializer();
    if (!initializer) continue;
    if (Node.isStringLiteral(initializer))
      properties[property.getName()] = { type: "string", example: initializer.getLiteralText() };
    else if (Node.isNumericLiteral(initializer))
      properties[property.getName()] = { type: "number", example: Number(initializer.getText()) };
    else if (
      initializer.getKind() === SyntaxKind.TrueKeyword ||
      initializer.getKind() === SyntaxKind.FalseKeyword
    )
      properties[property.getName()] = { type: "boolean" };
    else
      properties[property.getName()] = schemaFromTypeNode(
        initializer.getType().getText() ? undefined : undefined,
        object.getSourceFile()
      );
  }
  return { type: "object", properties };
}

function mergeParameters(first: ApiParameter[], second: ApiParameter[]): ApiParameter[] {
  return [
    ...new Map(
      [...first, ...second].map((parameter) => [
        `${parameter.location}:${parameter.name}`,
        parameter
      ])
    ).values()
  ];
}

function dedupeParameters(parameters: ApiParameter[]): ApiParameter[] {
  return mergeParameters([], parameters);
}
