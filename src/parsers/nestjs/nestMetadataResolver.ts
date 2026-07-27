import {
  Node,
  type ClassDeclaration,
  type Decorator,
  type MethodDeclaration,
  type ParameterDeclaration,
  SyntaxKind
} from "ts-morph";
import type { ApiParameter, ApiResponse, ApiSchema, RequestBodyMetadata } from "../../core/types";
import {
  commentFor,
  evaluateString,
  getNumericValue,
  objectValue,
  schemaFromTypeNode,
  schemaFromTypeText
} from "../../utils/astUtils";

export interface NestMethodMetadata {
  summary?: string;
  description?: string;
  parameters: ApiParameter[];
  requestBody?: RequestBodyMetadata;
  responses: ApiResponse[];
  middleware: string[];
  authentication?: { type: "bearer"; description: string };
  unresolvedItems: string[];
}

export class NestMetadataResolver {
  resolve(
    controller: ClassDeclaration,
    method: MethodDeclaration,
    httpMethod: string
  ): NestMethodMetadata {
    const operation = decorator(controller, "ApiOperation") ?? decorator(method, "ApiOperation");
    const operationObject = operation
      ?.getArguments()[0]
      ?.asKind(SyntaxKind.ObjectLiteralExpression);
    const summary = stringFrom(objectValue(operationObject, "summary")) ?? commentFor(method);
    const description =
      stringFrom(objectValue(operationObject, "description")) ?? commentFor(method);
    const parameterMetadata = method
      .getParameters()
      .map((parameter) => this.parameter(parameter))
      .filter(Boolean) as ParameterResult[];
    const body = requestBody(parameterMetadata);
    const params = parameterMetadata.flatMap((result) =>
      result.parameter ? [result.parameter] : []
    );
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

  private parameter(parameter: ParameterDeclaration): ParameterResult | undefined {
    const sourceFile = parameter.getSourceFile();
    for (const current of parameter.getDecorators()) {
      const name = current.getName();
      const argument = current.getArguments()[0];
      const key = stringFrom(argument) ?? parameter.getName();
      const type = parameter.getTypeNode()?.getText() ?? parameter.getType().getText(parameter);
      const schema = schemaFromTypeNode(parameter.getTypeNode(), sourceFile);
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

interface ParameterResult {
  parameter?: ApiParameter;
  bodyKey?: string;
  schema?: ApiSchema;
  type?: string;
  required?: boolean;
}

function requestBody(results: ParameterResult[]): RequestBodyMetadata | undefined {
  const bodies = results.filter((result) => result.schema);
  if (!bodies.length) return undefined;
  const whole = bodies.find((result) => !result.bodyKey);
  if (whole)
    return {
      required: whole.required ?? true,
      contentType: "application/json",
      schema: whole.schema!
    };
  const properties = Object.fromEntries(bodies.map((result) => [result.bodyKey!, result.schema!]));
  return {
    required: bodies.some((result) => result.required),
    contentType: "application/json",
    schema: {
      type: "object",
      properties,
      required: bodies.filter((result) => result.required).map((result) => result.bodyKey!)
    }
  };
}

function apiResponses(method: MethodDeclaration, defaultStatus: number): ApiResponse[] {
  return method
    .getDecorators()
    .filter((item) => item.getName() === "ApiResponse")
    .map((decorator) => {
      const options = decorator.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
      const status = getNumericValue(objectValue(options, "status")) ?? defaultStatus;
      const description =
        stringFrom(objectValue(options, "description")) ??
        (status >= 400 ? "Error response" : "Successful response");
      const typeExpression = objectValue(options, "type");
      return {
        statusCode: String(status),
        description,
        contentType: "application/json",
        schema: schemaFromResponseType(typeExpression)
      };
    });
}

function schemaFromResponseType(expression: Node | undefined): ApiSchema | undefined {
  if (!expression || !Node.isIdentifier(expression)) return undefined;
  const declaration = expression.getDefinitions()[0]?.getDeclarationNode();
  const sourceFile = declaration?.getSourceFile() ?? expression.getSourceFile();
  return schemaFromTypeText(expression.getText(), sourceFile);
}

function middlewareFromDecorators(decorators: Decorator[]): string[] {
  return decorators
    .filter((item) => item.getName() === "UseGuards" || item.getName() === "UseInterceptors")
    .flatMap((item) => item.getArguments().map((argument) => argument.getText()));
}

function httpStatus(method: MethodDeclaration): number | undefined {
  const httpCode = decorator(method, "HttpCode");
  return getNumericValue(httpCode?.getArguments()[0]);
}

function decorator(
  node: ClassDeclaration | MethodDeclaration,
  name: string
): Decorator | undefined {
  return node.getDecorators().find((item) => item.getName() === name);
}

function stringFrom(expression: Node | undefined): string | undefined {
  const result = evaluateString(expression);
  return result.resolved ? result.value : undefined;
}

function dedupe(parameters: ApiParameter[]): ApiParameter[] {
  return [
    ...new Map(
      parameters.map((parameter) => [`${parameter.location}:${parameter.name}`, parameter])
    ).values()
  ];
}
