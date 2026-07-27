import {
  Node,
  type ObjectLiteralExpression
} from "ts-morph";
import type { ApiEndpoint, ParserContext, ScanDiagnostic } from "../../core/types";
import { evaluateString, sourceLocation } from "../../utils/astUtils";

export interface Metadata {
  summary: string | undefined;
  description: string | undefined;
  parameters: ApiEndpoint["parameters"];
  requestBody: ApiEndpoint["requestBody"] | undefined;
  responses: ApiEndpoint["responses"];
  middleware: string[];
  unresolvedItems: string[];
  source: ApiEndpoint["source"];
}

export class FastifyMetadataResolver {
  resolve(route: { call: Node; args: Node[] }, context: ParserContext): Metadata {
    const [firstArg, ...remainingArgs] = route.args;
    const source = sourceLocation(route.call);

    if (firstArg && Node.isObjectLiteralExpression(firstArg)) {
      return this.resolveFromOptions(firstArg, source);
    }

    // Fallback to handler-based extraction
    const handler = remainingArgs[0];
    return {
      summary: undefined,
      description: undefined,
      parameters: [],
      requestBody: undefined,
      responses: [{ statusCode: "200", description: "OK" }],
      middleware: [],
      unresolvedItems: [],
      source
    };
  }

  private resolveFromOptions(options: Node.ObjectLiteralExpression, source: ApiEndpoint["source"]): Metadata {
    const props = options.getProperties();
    const summary = evaluateString(props.find(p => p.getName() === "summary")?.getInitializer()!).value;
    const description = evaluateString(props.find(p => p.getName() === "description")?.getInitializer()!).value;

    const schemaProp = props.find(p => p.getName() === "schema");
    const parameters: ApiEndpoint["parameters"] = [];
    const responses: ApiEndpoint["responses"] = [{ statusCode: "200", description: "OK" }];
    let requestBody: ApiEndpoint["requestBody"] | undefined = undefined;

    if (schemaProp) {
      const schema = schemaProp.getInitializer();
      if (schema && Node.isObjectLiteralExpression(schema)) {
        // Extract from JSON Schema (Fastify style)
        const body = schema.getProperties().find(p => p.getName() === "body");
        if (body) {
          requestBody = {
            contentType: "application/json",
            required: true,
            description: "Request body schema",
            schema: this.parseJsonSchema(body.getInitializer())
          };
        }

        const params = schema.getProperties().find(p => p.getName() === "params");
        if (params) {
          const paramSchema = params.getInitializer();
          if (paramSchema && Node.isObjectLiteralExpression(paramSchema)) {
            for (const prop of paramSchema.getProperties()) {
              parameters.push({
                name: prop.getName(),
                location: "path",
                type: "string",
                required: true,
                description: undefined
              });
            }
          }
        }

        const responseProp = schema.getProperties().find(p => p.getName() === "response");
        if (responseProp) {
          // Replace default response with the schema-based one
          responses[0] = {
            statusCode: "200",
            contentType: "application/json",
            description: "Successful response",
            schema: this.parseJsonSchema(responseProp.getInitializer())
          };
        }
      }
    }

    return {
      summary: summary || undefined,
      description: description || undefined,
      parameters,
      requestBody,
      responses,
      middleware: [],
      unresolvedItems: [],
      source
    };
  }

  private parseJsonSchema(node: Node | undefined): any {
    if (!node || !Node.isObjectLiteralExpression(node)) return { type: "object" };
    const properties: Record<string, any> = {};
    const propsNode = node.getProperties().find(p => p.getName() === "properties");
    if (propsNode && Node.isObjectLiteralExpression(propsNode.getInitializer()!)) {
      for (const prop of propsNode.getInitializer()!.getProperties()) {
        properties[prop.getName()] = { type: "string" }; // Simplified
      }
    }
    return { type: "object", properties };
  }
}
