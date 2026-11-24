import ts from "typescript";
import type { DataFlowReport, VariableDef, VariableUse, DataFlowIssue } from "./intelligence-types";

export function analyzeFunctionDataFlow(
    functionDecl: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    filePath: string,
    sourceFile: ts.SourceFile
): DataFlowReport {
    const funcName = "name" in functionDecl && functionDecl.name
        ? functionDecl.name.getText(sourceFile)
        : "anonymous";

    const definitions: VariableDef[] = [];
    const uses: VariableUse[] = [];
    const issues: DataFlowIssue[] = [];

    // 1. Parameters are definitions
    for (const param of functionDecl.parameters) {
        if (ts.isIdentifier(param.name)) {
            const pos = sourceFile.getLineAndCharacterOfPosition(param.getStart(sourceFile));
            definitions.push({
                name: param.name.text,
                line: pos.line + 1,
                column: pos.character + 1,
                kind: "parameter"
            });
        }
    }

    const declaredVarNames = new Set(definitions.map(d => d.name));

    // 2. Walk AST to find variable declarations, assignments, and reads
    function visit(node: ts.Node): void {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text;
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            const list = node.parent;
            const kindStr = ts.isVariableDeclarationList(list)
                ? (list.flags & ts.NodeFlags.Const ? "const" : list.flags & ts.NodeFlags.Let ? "let" : "var")
                : "let";

            definitions.push({
                name,
                line: pos.line + 1,
                column: pos.character + 1,
                kind: kindStr
            });
            declaredVarNames.add(name);

            if (node.initializer) {
                uses.push({
                    name,
                    line: pos.line + 1,
                    column: pos.character + 1,
                    type: "write"
                });
                // Visit initializer for reads of other variables
                visit(node.initializer);
            }
            return;
        }

        // Assignment expression: x = value
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left)
        ) {
            const name = node.left.text;
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            uses.push({
                name,
                line: pos.line + 1,
                column: pos.character + 1,
                type: "write"
            });
            visit(node.right);
            return;
        }

        // Identifier reads
        if (ts.isIdentifier(node)) {
            const name = node.text;
            // Ignore property access names, declaration names, etc.
            const parent = node.parent;
            const isPropertyName =
                ts.isPropertyAccessExpression(parent) && parent.name === node;
            const isDeclarationName =
                (ts.isVariableDeclaration(parent) && parent.name === node) ||
                (ts.isParameter(parent) && parent.name === node) ||
                (ts.isFunctionDeclaration(parent) && parent.name === node);

            if (!isPropertyName && !isDeclarationName && declaredVarNames.has(name)) {
                const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                uses.push({
                    name,
                    line: pos.line + 1,
                    column: pos.character + 1,
                    type: "read"
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    if (functionDecl.body) {
        visit(functionDecl.body);
    }

    // 3. Compute Def-Use issues
    // Check if variables declared/written are never read
    for (const def of definitions) {
        // Skip common parameter conventions like '_'
        if (def.name.startsWith("_")) {
            continue;
        }

        const reads = uses.filter(u => u.name === def.name && u.type === "read");
        if (reads.length === 0) {
            issues.push({
                type: "unused-assignment",
                variableName: def.name,
                filePath,
                line: def.line,
                column: def.column,
                message: `Variable '${def.name}' is declared or assigned but never read in '${funcName}'.`
            });
        }
    }

    return {
        functionName: funcName,
        filePath,
        definitions,
        uses,
        issues
    };
}
