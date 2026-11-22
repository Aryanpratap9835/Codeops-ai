import ts from "typescript";
import { SourceLocation, SymbolInfo, SymbolKind } from "./parser-types";

function getLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
    const start = node.getStart(sourceFile);
    const position = sourceFile.getLineAndCharacterOfPosition(start);
    return {
        line: position.line + 1,
        column: position.character + 1,
        start,
        end: node.getEnd()
    };
}

function getName(node: ts.Node): string {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return node.text;
    }
    return node.getText();
}

function hasExportModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isVariableExported(declaration: ts.VariableDeclaration): boolean {
    const list = declaration.parent;
    if (!ts.isVariableDeclarationList(list)) return false;
    const statement = list.parent;
    return ts.isVariableStatement(statement) && hasExportModifier(statement);
}

function isFunctionLikeExpression(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
    return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function createSymbol(
    name: string,
    kind: SymbolKind,
    filePath: string,
    node: ts.Node,
    sourceFile: ts.SourceFile,
    parentId: string | null,
    parentQualifiedName: string | null,
    exported: boolean
): SymbolInfo {
    const location = getLocation(node, sourceFile);
    const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
    return {
        id: `${filePath}:${kind}:${location.start}`,
        name,
        qualifiedName,
        kind,
        filePath,
        location,
        exported,
        parentId
    };
}

export function extractSymbols(sourceFile: ts.SourceFile, filePath: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    function visit(
        node: ts.Node,
        parentId: string | null = null,
        parentQualifiedName: string | null = null
    ): void {
        if (ts.isClassDeclaration(node)) {
            const symbol = createSymbol(
                node.name?.text ?? "anonymous",
                "class", filePath, node, sourceFile,
                parentId, parentQualifiedName, hasExportModifier(node)
            );
            symbols.push(symbol);
            for (const member of node.members) {
                visit(member, symbol.id, symbol.qualifiedName);
            }
            return;
        }

        if (ts.isFunctionDeclaration(node)) {
            const symbol = createSymbol(
                node.name?.text ?? `anonymous@${getLocation(node, sourceFile).line}`,
                "function", filePath, node, sourceFile,
                parentId, parentQualifiedName, hasExportModifier(node)
            );
            symbols.push(symbol);
            ts.forEachChild(node, child => visit(child, symbol.id, symbol.qualifiedName));
            return;
        }

        if (ts.isMethodDeclaration(node)) {
            const symbol = createSymbol(
                getName(node.name), "method", filePath, node, sourceFile,
                parentId, parentQualifiedName, false
            );
            symbols.push(symbol);
            ts.forEachChild(node, child => visit(child, symbol.id, symbol.qualifiedName));
            return;
        }

        if (
            ts.isVariableDeclaration(node) &&
            node.initializer &&
            isFunctionLikeExpression(node.initializer)
        ) {
            const symbol = createSymbol(
                getName(node.name), "function", filePath, node, sourceFile,
                parentId, parentQualifiedName, isVariableExported(node)
            );
            symbols.push(symbol);
            ts.forEachChild(node.initializer, child => visit(child, symbol.id, symbol.qualifiedName));
            return;
        }

        // Anonymous callbacks and function expressions not assigned directly to a variable.
        if (isFunctionLikeExpression(node)) {
            const location = getLocation(node, sourceFile);
            const name = ts.isFunctionExpression(node) && node.name
                ? node.name.text
                : `<anonymous@${location.line}:${location.column}>`;
            const symbol = createSymbol(
                name, "function", filePath, node, sourceFile,
                parentId, parentQualifiedName, false
            );
            symbols.push(symbol);
            ts.forEachChild(node, child => visit(child, symbol.id, symbol.qualifiedName));
            return;
        }

        if (ts.isPropertyDeclaration(node) && parentId !== null) {
            const symbol = createSymbol(
                getName(node.name), "property", filePath, node, sourceFile,
                parentId, parentQualifiedName, false
            );
            symbols.push(symbol);
            if (node.initializer) {
                visit(node.initializer, symbol.id, symbol.qualifiedName);
            }
            return;
        }

        ts.forEachChild(node, child => visit(child, parentId, parentQualifiedName));
    }

    visit(sourceFile);
    return symbols;
}
