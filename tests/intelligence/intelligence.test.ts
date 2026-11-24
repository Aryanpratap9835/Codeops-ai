import { describe, it, expect } from "vitest";
import ts from "typescript";
import { buildCFG } from "../../src/core/intelligence/cfg";
import { analyzeFunctionDataFlow } from "../../src/core/intelligence/data-flow";
import { analyzeTaintFlows } from "../../src/core/intelligence/taint-analysis";
import { analyzeFunctionComplexity } from "../../src/core/intelligence/complexity-analyzer";
import { detectCodeDuplicates } from "../../src/core/intelligence/duplicate-detector";
import { analyzeCodeIntelligence } from "../../src/core/intelligence/intelligence-engine";

function parseFunction(source: string): {
    func: ts.FunctionDeclaration;
    sourceFile: ts.SourceFile;
} {
    const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let func: ts.FunctionDeclaration | undefined;

    for (const stmt of sourceFile.statements) {
        if (ts.isFunctionDeclaration(stmt)) {
            func = stmt;
            break;
        }
    }

    if (!func) {
        throw new Error("No function found in source");
    }

    return { func, sourceFile };
}

describe("Milestone 5 — Advanced Code Intelligence", () => {
    describe("1. Control-Flow Analysis (CFG)", () => {
        it("constructs CFG with branches, loops, returns, and exits", () => {
            const { func, sourceFile } = parseFunction(`
                function testFlow(x: number) {
                    if (x > 0) {
                        return 1;
                    } else {
                        while (x < 0) {
                            x++;
                        }
                    }
                    return 0;
                }
            `);

            const cfg = buildCFG(func, "test.ts", sourceFile);

            expect(cfg.functionName).toBe("testFlow");
            expect(cfg.nodes.some(n => n.type === "branch")).toBe(true);
            expect(cfg.nodes.some(n => n.type === "loop")).toBe(true);
            expect(cfg.nodes.some(n => n.type === "return")).toBe(true);
            expect(cfg.nodes.some(n => n.type === "entry")).toBe(true);
            expect(cfg.nodes.some(n => n.type === "exit")).toBe(true);
        });

        it("detects unreachable code statements placed after an unconditional return", () => {
            const { func, sourceFile } = parseFunction(`
                function deadCodeExample() {
                    const a = 1;
                    return a;
                    const b = 2;
                }
            `);

            const cfg = buildCFG(func, "test.ts", sourceFile);
            // Statement after return must not be reachable from entry
            expect(cfg.unreachableNodes.length).toBeGreaterThanOrEqual(1);
            expect(cfg.unreachableNodes.some(n => n.label.includes("const b"))).toBe(true);
        });
    });

    describe("2. Data-Flow Analysis", () => {
        it("identifies variable definitions, reads, and writes", () => {
            const { func, sourceFile } = parseFunction(`
                function calculate(base: number) {
                    let total = base * 2;
                    total = total + 5;
                    return total;
                }
            `);

            const df = analyzeFunctionDataFlow(func, "test.ts", sourceFile);

            expect(df.definitions.some(d => d.name === "base")).toBe(true);
            expect(df.definitions.some(d => d.name === "total")).toBe(true);
            expect(df.uses.some(u => u.name === "total" && u.type === "write")).toBe(true);
            expect(df.uses.some(u => u.name === "total" && u.type === "read")).toBe(true);
            expect(df.issues.length).toBe(0);
        });

        it("flags unused variable assignments", () => {
            const { func, sourceFile } = parseFunction(`
                function process() {
                    const unusedVar = 42;
                    return 10;
                }
            `);

            const df = analyzeFunctionDataFlow(func, "test.ts", sourceFile);

            expect(df.issues.some(i => i.type === "unused-assignment" && i.variableName === "unusedVar")).toBe(true);
        });
    });

    describe("3. Taint Analysis (Source-to-Sink)", () => {
        it("tracks unsanitized HTTP input propagating to database query sink", () => {
            const source = `
                function handle(req: any) {
                    const userId = req.params.id;
                    const query = "SELECT * FROM users WHERE id = " + userId;
                    db.query(query);
                }
            `;
            const sourceFile = ts.createSourceFile("handler.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

            const taints = analyzeTaintFlows("handler.ts", sourceFile);

            expect(taints.length).toBeGreaterThanOrEqual(1);
            const flow = taints[0]!;
            expect(flow.source.kind).toBe("http-param");
            expect(flow.sink.kind).toBe("sql");
            expect(flow.isSanitized).toBe(false);
            expect(flow.propagationPath).toContain("userId");
        });

        it("recognizes sanitizers and marks taint flow as sanitized", () => {
            const source = `
                function handle(req: any) {
                    const safeId = parseInt(req.params.id);
                    db.query("SELECT * FROM users WHERE id = " + safeId);
                }
            `;
            const sourceFile = ts.createSourceFile("handler.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

            const taints = analyzeTaintFlows("handler.ts", sourceFile);

            expect(taints.length).toBeGreaterThanOrEqual(1);
            const flow = taints[0]!;
            expect(flow.isSanitized).toBe(true);
            expect(flow.sanitizer).toBe("parseInt");
        });
    });

    describe("4. Duplicate Code Detection", () => {
        it("detects identical multiline code blocks across files", () => {
            const commonBlock = `
                const a = 1;
                const b = 2;
                const c = a + b;
                console.log(c);
                return c;
            `;

            const fileA = { filePath: "src/fileA.ts", content: `function runA() { ${commonBlock} }` };
            const fileB = { filePath: "src/fileB.ts", content: `function runB() { ${commonBlock} }` };

            const duplicates = detectCodeDuplicates([fileA, fileB], { minLines: 4 });

            expect(duplicates.length).toBeGreaterThanOrEqual(1);
            expect(duplicates[0]?.instances.length).toBe(2);
            expect(duplicates[0]?.similarity).toBe(1.0);
        });
    });

    describe("5. Function Complexity Analysis", () => {
        it("calculates cyclomatic complexity, nesting depth, and maintainability index", () => {
            const { func, sourceFile } = parseFunction(`
                function complexFunction(a: number, b: number) {
                    if (a > 0) {
                        for (let i = 0; i < a; i++) {
                            if (b > i && a === 10) {
                                return i;
                            }
                        }
                    }
                    return 0;
                }
            `);

            const complexity = analyzeFunctionComplexity(func, "test.ts", sourceFile);

            expect(complexity.name).toBe("complexFunction");
            expect(complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(4);
            expect(complexity.nestingDepth).toBeGreaterThanOrEqual(3);
            expect(complexity.parameterCount).toBe(2);
            expect(complexity.maintainabilityIndex).toBeLessThan(100);
        });
    });

    describe("6. Aggregated Code Intelligence Engine", () => {
        it("aggregates CFG, data flow, taint flows, duplicates, and complexity across files", () => {
            const files = [
                {
                    filePath: "src/service.ts",
                    content: `
                        export function queryUser(req: any) {
                            const id = req.query.id;
                            db.query("SELECT " + id);
                            return id;
                        }
                    `
                }
            ];

            const report = analyzeCodeIntelligence(files);

            expect(report.cfgs.length).toBe(1);
            expect(report.taintFlows.length).toBe(1);
            expect(report.complexFunctions.length).toBe(1);
            expect(report.averageComplexity).toBeGreaterThanOrEqual(1);
        });
    });
});
