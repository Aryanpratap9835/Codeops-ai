import ts from "typescript";
import type { SourceLocation } from "../parser/parser-types";
import type { TaintFlow, TaintSourceKind, TaintSinkKind } from "./intelligence-types";

function getLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
    const start = node.getStart(sourceFile);
    const pos = sourceFile.getLineAndCharacterOfPosition(start);
    return {
        line: pos.line + 1,
        column: pos.character + 1,
        start,
        end: node.getEnd()
    };
}

const SANITIZER_FUNCTIONS = new Set([
    "parseInt",
    "parseFloat",
    "Number",
    "encodeURIComponent",
    "encodeURI",
    "escape",
    "DOMPurify.sanitize",
    "sanitizeHtml",
    "path.basename",
    "validator.escape"
]);

export function analyzeTaintFlows(
    filePath: string,
    sourceFile: ts.SourceFile
): TaintFlow[] {
    const flows: TaintFlow[] = [];

    // Map tainted variable name -> details
    const taintedVars = new Map<string, {
        sourceKind: TaintSourceKind;
        sourceExpr: string;
        sourceLoc: SourceLocation;
        path: string[];
        isSanitized: boolean;
        sanitizer?: string;
    }>();

    function checkSource(expr: ts.Expression): { kind: TaintSourceKind; text: string } | null {
        const text = expr.getText(sourceFile);
        if (text.startsWith("req.params") || text.startsWith("request.params")) return { kind: "http-param", text };
        if (text.startsWith("req.query") || text.startsWith("request.query")) return { kind: "http-query", text };
        if (text.startsWith("req.body") || text.startsWith("request.body")) return { kind: "http-body", text };
        if (text.startsWith("process.env.")) return { kind: "env", text };
        return null;
    }

    function checkSanitizer(expr: ts.Expression): string | null {
        if (ts.isCallExpression(expr)) {
            const callee = expr.expression.getText(sourceFile);
            if (SANITIZER_FUNCTIONS.has(callee) || callee.endsWith(".sanitize") || callee.endsWith(".basename")) {
                return callee;
            }
        }
        return null;
    }

    function findReferencedTaintedVar(node: ts.Node): string | null {
        const text = node.getText(sourceFile);
        for (const varName of taintedVars.keys()) {
            const regex = new RegExp(`\\b${varName}\\b`);
            if (regex.test(text)) {
                return varName;
            }
        }
        return null;
    }

    // Step 1: Track tainted variable definitions
    function visitDefinitions(node: ts.Node): void {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            const varName = node.name.text;
            const init = node.initializer;

            const sanitizerName = checkSanitizer(init);
            let rawExpr = init;
            if (sanitizerName && ts.isCallExpression(init) && init.arguments.length > 0) {
                rawExpr = init.arguments[0]!;
            }

            const directSource = checkSource(rawExpr);
            if (directSource) {
                taintedVars.set(varName, {
                    sourceKind: directSource.kind,
                    sourceExpr: directSource.text,
                    sourceLoc: getLocation(init, sourceFile),
                    path: [varName],
                    isSanitized: Boolean(sanitizerName),
                    sanitizer: sanitizerName ?? undefined
                });
            } else {
                const referencedTainted = findReferencedTaintedVar(rawExpr);
                if (referencedTainted) {
                    const prev = taintedVars.get(referencedTainted)!;
                    taintedVars.set(varName, {
                        ...prev,
                        path: [...prev.path, varName],
                        isSanitized: prev.isSanitized || Boolean(sanitizerName),
                        sanitizer: sanitizerName ?? prev.sanitizer
                    });
                }
            }
        }

        ts.forEachChild(node, visitDefinitions);
    }

    visitDefinitions(sourceFile);

    // Step 2: Track sinks
    function visitSinks(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(sourceFile);
            let sinkKind: TaintSinkKind | null = null;

            if (callee.endsWith(".query") || callee.endsWith(".raw") || callee === "query") {
                sinkKind = "sql";
            } else if (callee === "exec" || callee === "execSync" || callee.endsWith(".exec")) {
                sinkKind = "shell";
            } else if (callee.endsWith("readFile") || callee.endsWith("readFileSync") || callee.endsWith("writeFile")) {
                sinkKind = "filesystem";
            } else if (callee === "eval" || callee === "Function") {
                sinkKind = "eval";
            }

            if (sinkKind && node.arguments.length > 0) {
                const arg = node.arguments[0]!;
                const referencedTainted = findReferencedTaintedVar(arg);

                if (referencedTainted) {
                    const info = taintedVars.get(referencedTainted)!;
                    flows.push({
                        id: `taint:${filePath}:${info.sourceLoc.start}->${node.getStart(sourceFile)}`,
                        source: {
                            kind: info.sourceKind,
                            expression: info.sourceExpr,
                            location: info.sourceLoc
                        },
                        sink: {
                            kind: sinkKind,
                            expression: callee,
                            location: getLocation(node, sourceFile)
                        },
                        propagationPath: [...info.path, callee],
                        isSanitized: info.isSanitized,
                        sanitizer: info.sanitizer,
                        confidence: info.isSanitized ? "low" : "high",
                        filePath
                    });
                }
            }
        }

        ts.forEachChild(node, visitSinks);
    }

    visitSinks(sourceFile);

    return flows;
}
