"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateString = evaluateString;
exports.sourceLocation = sourceLocation;
exports.getPropertyName = getPropertyName;
exports.objectValue = objectValue;
exports.getNumericValue = getNumericValue;
exports.getLiteralValue = getLiteralValue;
exports.schemaFromTypeNode = schemaFromTypeNode;
exports.schemaFromTypeText = schemaFromTypeText;
exports.commentFor = commentFor;
const ts_morph_1 = require("ts-morph");
function evaluateString(expression, seen = new Set(), depth = 0) {
    if (!expression)
        return { expression: "<missing>", resolved: false };
    const text = expression.getText();
    if (depth > 8)
        return { expression: text, resolved: false };
    if (ts_morph_1.Node.isStringLiteral(expression) || ts_morph_1.Node.isNoSubstitutionTemplateLiteral(expression)) {
        return { value: expression.getLiteralText(), expression: text, resolved: true };
    }
    if (ts_morph_1.Node.isTemplateExpression(expression)) {
        if (expression.getTemplateSpans().length === 0)
            return { value: expression.getHead().getLiteralText(), expression: text, resolved: true };
        return { expression: text, resolved: false };
    }
    if (ts_morph_1.Node.isParenthesizedExpression(expression))
        return evaluateString(expression.getExpression(), seen, depth + 1);
    if (ts_morph_1.Node.isBinaryExpression(expression) &&
        expression.getOperatorToken().getKind() === ts_morph_1.SyntaxKind.PlusToken) {
        const left = evaluateString(expression.getLeft(), seen, depth + 1);
        const right = evaluateString(expression.getRight(), seen, depth + 1);
        if (left.resolved && right.resolved) {
            return { value: `${left.value ?? ""}${right.value ?? ""}`, expression: text, resolved: true };
        }
        return { expression: text, resolved: false };
    }
    if (ts_morph_1.Node.isIdentifier(expression)) {
        const key = `${expression.getSourceFile().getFilePath()}:${expression.getText()}`;
        if (seen.has(key))
            return { expression: text, resolved: false };
        seen.add(key);
        const declaration = expression.getDefinitions()[0]?.getDeclarationNode();
        if (declaration && ts_morph_1.Node.isVariableDeclaration(declaration)) {
            return evaluateString(declaration.getInitializer(), seen, depth + 1);
        }
    }
    return { expression: text, resolved: false };
}
function sourceLocation(node) {
    const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
    return {
        filePath: node.getSourceFile().getFilePath(),
        line: position.line,
        column: position.column
    };
}
function getPropertyName(call) {
    const expression = call.getExpression();
    return ts_morph_1.Node.isPropertyAccessExpression(expression) ? expression.getName() : undefined;
}
function objectValue(object, name) {
    const property = object?.getProperty(name);
    return property && ts_morph_1.Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}
function getNumericValue(expression) {
    if (!expression)
        return undefined;
    if (ts_morph_1.Node.isNumericLiteral(expression))
        return Number(expression.getText());
    return undefined;
}
function getLiteralValue(expression) {
    if (!expression)
        return undefined;
    if (ts_morph_1.Node.isStringLiteral(expression) || ts_morph_1.Node.isNoSubstitutionTemplateLiteral(expression))
        return expression.getLiteralText();
    if (ts_morph_1.Node.isNumericLiteral(expression))
        return Number(expression.getText());
    if (expression.getKind() === ts_morph_1.SyntaxKind.TrueKeyword)
        return true;
    if (expression.getKind() === ts_morph_1.SyntaxKind.FalseKeyword)
        return false;
    if (ts_morph_1.Node.isArrayLiteralExpression(expression))
        return expression.getElements().map((element) => getLiteralValue(element));
    if (ts_morph_1.Node.isObjectLiteralExpression(expression)) {
        return Object.fromEntries(expression.getProperties().flatMap((property) => {
            if (!ts_morph_1.Node.isPropertyAssignment(property))
                return [];
            return [[property.getName(), getLiteralValue(property.getInitializer())]];
        }));
    }
    return undefined;
}
function schemaFromTypeNode(typeNode, sourceFile, stack = new Set()) {
    if (!typeNode)
        return { type: "object", additionalProperties: true };
    const text = typeNode.getText().replace(/\s/g, "");
    if (text.endsWith("[]"))
        return { type: "array", items: schemaFromTypeText(text.slice(0, -2), sourceFile, stack) };
    if (ts_morph_1.Node.isArrayTypeNode(typeNode))
        return {
            type: "array",
            items: schemaFromTypeNode(typeNode.getElementTypeNode(), sourceFile, stack)
        };
    if (ts_morph_1.Node.isUnionTypeNode(typeNode)) {
        const values = typeNode.getTypeNodes();
        const literals = values
            .map((item) => ts_morph_1.Node.isLiteralTypeNode(item) ? getLiteralValue(item.getLiteral()) : undefined)
            .filter((item) => typeof item === "string" || typeof item === "number");
        if (literals.length === values.length)
            return { type: typeof literals[0] === "number" ? "number" : "string", enum: literals };
        const nonNull = values.find((item) => item.getText() !== "undefined" && item.getText() !== "null");
        return {
            ...schemaFromTypeNode(nonNull, sourceFile, stack),
            nullable: values.some((item) => item.getText() === "null")
        };
    }
    return schemaFromTypeText(text, sourceFile, stack);
}
function schemaFromTypeText(text, sourceFile, stack = new Set()) {
    const normalized = text.replace(/\s/g, "");
    if (["string", "String"].includes(normalized))
        return { type: "string" };
    if (["number", "Number", "float", "double"].includes(normalized))
        return { type: "number" };
    if (["int", "integer"].includes(normalized))
        return { type: "integer" };
    if (["boolean", "Boolean"].includes(normalized))
        return { type: "boolean" };
    if (["Date"].includes(normalized))
        return { type: "string", format: "date-time" };
    if (["unknown", "any", "object", "Record<string,unknown>", "Record<string, any>"].includes(normalized))
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
            enum: values
        };
    }
    const classDeclaration = sourceFile.getClass(normalized);
    if (classDeclaration && !stack.has(normalized)) {
        stack.add(normalized);
        const properties = {};
        const required = [];
        for (const property of classDeclaration.getProperties()) {
            const decorators = property.getDecorators().map((decorator) => decorator.getName());
            const propertySchema = schemaFromTypeNode(property.getTypeNode(), sourceFile, stack);
            if (decorators.includes("IsEmail"))
                propertySchema.format = "email";
            properties[property.getName()] = propertySchema;
            if (!property.hasQuestionToken() && !decorators.includes("IsOptional"))
                required.push(property.getName());
        }
        return { type: "object", properties, required };
    }
    return { type: "object", additionalProperties: true, description: `Type: ${normalized}` };
}
function commentFor(node) {
    const documented = node.asKind(ts_morph_1.SyntaxKind.FunctionDeclaration) ??
        node.asKind(ts_morph_1.SyntaxKind.MethodDeclaration) ??
        node.asKind(ts_morph_1.SyntaxKind.ClassDeclaration);
    const docs = documented?.getJsDocs();
    const description = docs?.map((doc) => doc.getDescription().trim()).find(Boolean);
    return description || undefined;
}
//# sourceMappingURL=astUtils.js.map