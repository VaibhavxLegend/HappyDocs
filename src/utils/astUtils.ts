import {
  type CallExpression,
  Node,
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
  type TypeNode
} from "ts-morph";
import type { ApiSchema, SourceLocation } from "../core/types";

export interface StaticString {
  value?: string;
  expression: string;
  resolved: boolean;
}

export function evaluateString(
  expression: Node | undefined,
  seen = new Set<string>(),
  depth = 0
): StaticString {
  if (!expression) return { expression: "<missing>", resolved: false };
  const text = expression.getText();
  if (depth > 8) return { expression: text, resolved: false };
  if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
    return { value: expression.getLiteralText(), expression: text, resolved: true };
  }
  if (Node.isTemplateExpression(expression)) {
    if (expression.getTemplateSpans().length === 0)
      return { value: expression.getHead().getLiteralText(), expression: text, resolved: true };
    return { expression: text, resolved: false };
  }
  if (Node.isParenthesizedExpression(expression))
    return evaluateString(expression.getExpression(), seen, depth + 1);
  if (
    Node.isBinaryExpression(expression) &&
    expression.getOperatorToken().getKind() === SyntaxKind.PlusToken
  ) {
    const left = evaluateString(expression.getLeft(), seen, depth + 1);
    const right = evaluateString(expression.getRight(), seen, depth + 1);
    if (left.resolved && right.resolved) {
      return { value: `${left.value ?? ""}${right.value ?? ""}`, expression: text, resolved: true };
    }
    return { expression: text, resolved: false };
  }
  if (Node.isIdentifier(expression)) {
    const key = `${expression.getSourceFile().getFilePath()}:${expression.getText()}`;
    if (seen.has(key)) return { expression: text, resolved: false };
    seen.add(key);
    const declaration = expression.getDefinitions()[0]?.getDeclarationNode();
    if (declaration && Node.isVariableDeclaration(declaration)) {
      return evaluateString(declaration.getInitializer(), seen, depth + 1);
    }
  }
  return { expression: text, resolved: false };
}

export function sourceLocation(node: Node): SourceLocation {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    filePath: node.getSourceFile().getFilePath(),
    line: position.line,
    column: position.column
  };
}

export function getPropertyName(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  return Node.isPropertyAccessExpression(expression) ? expression.getName() : undefined;
}

export function objectValue(
  object: ObjectLiteralExpression | undefined,
  name: string
): Node | undefined {
  const property = object?.getProperty(name);
  return property && Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}

export function getNumericValue(expression: Node | undefined): number | undefined {
  if (!expression) return undefined;
  if (Node.isNumericLiteral(expression)) return Number(expression.getText());
  return undefined;
}

export function getLiteralValue(expression: Node | undefined): unknown {
  if (!expression) return undefined;
  if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression))
    return expression.getLiteralText();
  if (Node.isNumericLiteral(expression)) return Number(expression.getText());
  if (expression.getKind() === SyntaxKind.TrueKeyword) return true;
  if (expression.getKind() === SyntaxKind.FalseKeyword) return false;
  if (Node.isArrayLiteralExpression(expression))
    return expression.getElements().map((element) => getLiteralValue(element));
  if (Node.isObjectLiteralExpression(expression)) {
    return Object.fromEntries(
      expression.getProperties().flatMap((property) => {
        if (!Node.isPropertyAssignment(property)) return [];
        return [[property.getName(), getLiteralValue(property.getInitializer())]];
      })
    );
  }
  return undefined;
}

export function schemaFromTypeNode(
  typeNode: TypeNode | undefined,
  sourceFile: SourceFile,
  stack = new Set<string>()
): ApiSchema {
  if (!typeNode) return { type: "object", additionalProperties: true };
  const text = typeNode.getText().replace(/\s/g, "");
  if (text.endsWith("[]"))
    return { type: "array", items: schemaFromTypeText(text.slice(0, -2), sourceFile, stack) };
  if (Node.isArrayTypeNode(typeNode))
    return {
      type: "array",
      items: schemaFromTypeNode(typeNode.getElementTypeNode(), sourceFile, stack)
    };
  if (Node.isUnionTypeNode(typeNode)) {
    const values = typeNode.getTypeNodes();
    const literals = values
      .map((item) =>
        Node.isLiteralTypeNode(item) ? getLiteralValue(item.getLiteral()) : undefined
      )
      .filter(
        (item): item is string | number => typeof item === "string" || typeof item === "number"
      );
    if (literals.length === values.length)
      return { type: typeof literals[0] === "number" ? "number" : "string", enum: literals };
    const nonNull = values.find(
      (item) => item.getText() !== "undefined" && item.getText() !== "null"
    );
    return {
      ...schemaFromTypeNode(nonNull, sourceFile, stack),
      nullable: values.some((item) => item.getText() === "null")
    };
  }
  return schemaFromTypeText(text, sourceFile, stack);
}

export function schemaFromTypeText(
  text: string,
  sourceFile: SourceFile,
  stack = new Set<string>()
): ApiSchema {
  const normalized = text.replace(/\s/g, "");
  if (["string", "String"].includes(normalized)) return { type: "string" };
  if (["number", "Number", "float", "double"].includes(normalized)) return { type: "number" };
  if (["int", "integer"].includes(normalized)) return { type: "integer" };
  if (["boolean", "Boolean"].includes(normalized)) return { type: "boolean" };
  if (["Date"].includes(normalized)) return { type: "string", format: "date-time" };
  if (
    ["unknown", "any", "object", "Record<string,unknown>", "Record<string, any>"].includes(
      normalized
    )
  )
    return { type: "object", additionalProperties: true };
  const arrayMatch = normalized.match(/^Array<(.+)>$/);
  if (arrayMatch)
    return { type: "array", items: schemaFromTypeText(arrayMatch[1], sourceFile, stack) };
  const enumDeclaration = sourceFile.getEnum(normalized);
  if (enumDeclaration) {
    const values = enumDeclaration
      .getMembers()
      .map((member) => member.getValue() ?? member.getName());
    return {
      type: typeof values[0] === "number" ? "number" : "string",
      enum: values as Array<string | number>
    };
  }
  const classDeclaration = sourceFile.getClass(normalized);
  if (classDeclaration && !stack.has(normalized)) {
    stack.add(normalized);
    const properties: Record<string, ApiSchema> = {};
    const required: string[] = [];
    for (const property of classDeclaration.getProperties()) {
      const decorators = property.getDecorators().map((decorator) => decorator.getName());
      const propertySchema = schemaFromTypeNode(property.getTypeNode(), sourceFile, stack);
      if (decorators.includes("IsEmail")) propertySchema.format = "email";
      properties[property.getName()] = propertySchema;
      if (!property.hasQuestionToken() && !decorators.includes("IsOptional"))
        required.push(property.getName());
    }
    return { type: "object", properties, required };
  }
  return { type: "object", additionalProperties: true, description: `Type: ${normalized}` };
}

export function commentFor(node: Node): string | undefined {
  const documented =
    node.asKind(SyntaxKind.FunctionDeclaration) ??
    node.asKind(SyntaxKind.MethodDeclaration) ??
    node.asKind(SyntaxKind.ClassDeclaration);
  const docs = documented?.getJsDocs();
  const description = docs?.map((doc) => doc.getDescription().trim()).find(Boolean);
  return description || undefined;
}
