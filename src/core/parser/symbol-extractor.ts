
import ts from "typescript";

import {
    SymbolInfo,
    SymbolKind,
    SourceLocation
} from "./parser-types";

function getLocation(
    node: ts.Node,
    sourceFile: ts.SourceFile
): SourceLocation {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const position =
        sourceFile.getLineAndCharacterOfPosition(start);

    return {
        line: position.line + 1,
        column: position.character + 1,
        start,
        end
    };
}

function getName(node: ts.Node): string {
    if (
        ts.isIdentifier(node) ||
        ts.isStringLiteral(node) ||
        ts.isNumericLiteral(node)
    ) {
        return node.text;
    }

    return node.getText();
}

function hasExportModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node)
        ? ts.getModifiers(node)
        : undefined;

    return modifiers?.some(
        modifier =>
            modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false;
}

function isVariableExported(
    declaration: ts.VariableDeclaration
): boolean {
    const declarationList = declaration.parent;

    if (!ts.isVariableDeclarationList(declarationList)) {
        return false;
    }

    const statement = declarationList.parent;

    return ts.isVariableStatement(statement) &&
        hasExportModifier(statement);
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

    const qualifiedName = parentQualifiedName
        ? `${parentQualifiedName}.${name}`
        : name;

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

export function extractSymbols(
    sourceFile: ts.SourceFile,
    filePath: string
): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    function visit(
        node: ts.Node,
        parentId: string | null = null,
        parentQualifiedName: string | null = null
    ): void {

        // 1. Class declarations
        if (ts.isClassDeclaration(node)) {
            const symbol = createSymbol(
                node.name?.text ?? "anonymous",
                "class",
                filePath,
                node,
                sourceFile,
                parentId,
                parentQualifiedName,
                hasExportModifier(node)
            );

            symbols.push(symbol);

            for (const member of node.members) {
                visit(
                    member,
                    symbol.id,
                    symbol.qualifiedName
                );
            }

            return;
        }

        // 2. Function declarations
        if (ts.isFunctionDeclaration(node)) {
            const symbol = createSymbol(
                node.name?.text ?? "anonymous",
                "function",
                filePath,
                node,
                sourceFile,
                parentId,
                parentQualifiedName,
                hasExportModifier(node)
            );

            symbols.push(symbol);

            ts.forEachChild(
                node,
                child => visit(
                    child,
                    symbol.id,
                    symbol.qualifiedName
                )
            );

            return;
        }

        // 3. Arrow functions and function expressions
        if (
            ts.isVariableDeclaration(node) &&
            node.initializer &&
            (
                ts.isArrowFunction(node.initializer) ||
                ts.isFunctionExpression(node.initializer)
            )
        ) {
            const initializer = node.initializer;

            const symbol = createSymbol(
                getName(node.name),
                "function",
                filePath,
                node,
                sourceFile,
                parentId,
                parentQualifiedName,
                isVariableExported(node)
            );

            symbols.push(symbol);

            ts.forEachChild(
                initializer,
                child => visit(
                    child,
                    symbol.id,
                    symbol.qualifiedName
                )
            );

            return;
        }

        // 4. Methods
        if (ts.isMethodDeclaration(node)) {
            const symbol = createSymbol(
                getName(node.name),
                "method",
                filePath,
                node,
                sourceFile,
                parentId,
                parentQualifiedName,
                false
            );

            symbols.push(symbol);

            ts.forEachChild(
                node,
                child => visit(
                    child,
                    symbol.id,
                    symbol.qualifiedName
                )
            );

            return;
        }

        // 5. Class properties
        if (
            ts.isPropertyDeclaration(node) &&
            parentId !== null
        ) {
            const symbol = createSymbol(
                getName(node.name),
                "property",
                filePath,
                node,
                sourceFile,
                parentId,
                parentQualifiedName,
                false
            );

            symbols.push(symbol);

            if (node.initializer) {
                visit(
                    node.initializer,
                    symbol.id,
                    symbol.qualifiedName
                );
            }

            return;
        }

        ts.forEachChild(
            node,
            child => visit(
                child,
                parentId,
                parentQualifiedName
            )
        );
    }

    visit(sourceFile);

    return symbols;
}