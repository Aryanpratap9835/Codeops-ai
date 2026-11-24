import * as fs from "node:fs";
import ts from "typescript";
import type {
    AdvancedIntelligenceReport,
    ControlFlowGraph,
    DataFlowIssue,
    FunctionComplexity,
    TaintFlow
} from "./intelligence-types";
import { buildCFG } from "./cfg";
import { analyzeFunctionDataFlow } from "./data-flow";
import { analyzeTaintFlows } from "./taint-analysis";
import { analyzeFunctionComplexity } from "./complexity-analyzer";
import { detectCodeDuplicates } from "./duplicate-detector";

export function analyzeCodeIntelligence(
    files: { filePath: string; content?: string }[]
): AdvancedIntelligenceReport {
    const cfgs: ControlFlowGraph[] = [];
    const dataFlowIssues: DataFlowIssue[] = [];
    const taintFlows: TaintFlow[] = [];
    const complexFunctions: FunctionComplexity[] = [];
    const loadedFiles: { filePath: string; content: string }[] = [];

    for (const file of files) {
        let content = file.content;
        if (content === undefined && fs.existsSync(file.filePath)) {
            try {
                content = fs.readFileSync(file.filePath, "utf-8");
            } catch {
                continue;
            }
        }

        if (content === undefined) {
            continue;
        }

        loadedFiles.push({ filePath: file.filePath, content });

        const scriptKind = file.filePath.endsWith(".tsx")
            ? ts.ScriptKind.TSX
            : file.filePath.endsWith(".jsx")
                ? ts.ScriptKind.JSX
                : file.filePath.endsWith(".js")
                    ? ts.ScriptKind.JS
                    : ts.ScriptKind.TS;

        const sourceFile = ts.createSourceFile(
            file.filePath,
            content,
            ts.ScriptTarget.Latest,
            true,
            scriptKind
        );

        // 1. Taint analysis on file
        const taints = analyzeTaintFlows(file.filePath, sourceFile);
        taintFlows.push(...taints);

        // 2. CFG, Data Flow & Complexity per function
        function visit(node: ts.Node): void {
            if (
                ts.isFunctionDeclaration(node) ||
                ts.isMethodDeclaration(node) ||
                ts.isArrowFunction(node) ||
                ts.isFunctionExpression(node)
            ) {
                // CFG
                const cfg = buildCFG(node, file.filePath, sourceFile);
                cfgs.push(cfg);

                // Data Flow
                const df = analyzeFunctionDataFlow(node, file.filePath, sourceFile);
                dataFlowIssues.push(...df.issues);

                // Complexity
                const comp = analyzeFunctionComplexity(node, file.filePath, sourceFile);
                complexFunctions.push(comp);
            }

            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
    }

    // 3. Duplicate code detection across loaded files
    const duplicateGroups = detectCodeDuplicates(loadedFiles);

    // Summary calculations
    const unreachableCodeCount = cfgs.reduce(
        (sum, cfg) => sum + cfg.unreachableNodes.length,
        0
    );

    const unsanitizedTaintCount = taintFlows.filter(t => !t.isSanitized).length;

    const totalComplexity = complexFunctions.reduce(
        (sum, c) => sum + c.cyclomaticComplexity,
        0
    );
    const averageComplexity = complexFunctions.length > 0
        ? Math.round((totalComplexity / complexFunctions.length) * 10) / 10
        : 0;

    return {
        cfgs,
        unreachableCodeCount,
        dataFlowIssues,
        taintFlows,
        unsanitizedTaintCount,
        duplicateGroups,
        complexFunctions: complexFunctions.sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity),
        averageComplexity
    };
}
