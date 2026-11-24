import ts from "typescript";
import type { FunctionComplexity } from "./intelligence-types";

export function analyzeFunctionComplexity(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    filePath: string,
    sourceFile: ts.SourceFile
): FunctionComplexity {
    const name = "name" in node && node.name
        ? node.name.getText(sourceFile)
        : "anonymous";

    const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const lineCount = Math.max(1, endPos.line - startPos.line + 1);
    const parameterCount = node.parameters.length;

    let cyclomaticComplexity = 1;
    let maxNestingDepth = 0;
    let currentDepth = 0;

    function visit(child: ts.Node): void {
        const isControlBlock =
            ts.isIfStatement(child) ||
            ts.isForStatement(child) ||
            ts.isForOfStatement(child) ||
            ts.isForInStatement(child) ||
            ts.isWhileStatement(child) ||
            ts.isDoStatement(child) ||
            ts.isCaseClause(child) ||
            ts.isCatchClause(child) ||
            ts.isConditionalExpression(child);

        if (isControlBlock) {
            cyclomaticComplexity++;
            currentDepth++;
            if (currentDepth > maxNestingDepth) {
                maxNestingDepth = currentDepth;
            }
        }

        // Logical operators that introduce branches: &&, ||, ??
        if (ts.isBinaryExpression(child)) {
            const op = child.operatorToken.kind;
            if (
                op === ts.SyntaxKind.AmpersandAmpersandToken ||
                op === ts.SyntaxKind.BarBarToken ||
                op === ts.SyntaxKind.QuestionQuestionToken
            ) {
                cyclomaticComplexity++;
            }
        }

        ts.forEachChild(child, visit);

        if (isControlBlock) {
            currentDepth--;
        }
    }

    if (node.body) {
        ts.forEachChild(node.body, visit);
    }

    // Maintainability Index (simplified normalized 0 to 100)
    // Decreases with high cyclomatic complexity and large line counts
    const rawMI = 100 - (cyclomaticComplexity * 3) - (maxNestingDepth * 4) - (lineCount * 0.2);
    const maintainabilityIndex = Math.max(0, Math.min(100, Math.round(rawMI)));

    const isComplex =
        cyclomaticComplexity >= 10 ||
        maxNestingDepth >= 4 ||
        lineCount >= 60;

    return {
        name,
        filePath,
        line: startPos.line + 1,
        cyclomaticComplexity,
        nestingDepth: maxNestingDepth,
        lineCount,
        parameterCount,
        maintainabilityIndex,
        isComplex
    };
}
