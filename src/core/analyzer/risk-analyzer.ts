
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import type { FileRisk } from "./analysis-types";
import { findCircularDependencyGroups } from "../graph/graph-analysis";

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function analyzeFileRisks(
    files: ParsedFile[],
    dependencyGraph: GraphResult,
    callGraph: CallGraphResult
): FileRisk[] {
    const circularGroups =
        findCircularDependencyGroups(dependencyGraph);

    const circularFiles = new Set(
        circularGroups.flat()
    );

    return files.map(file => {
        const incomingDependencies = dependencyGraph.edges.filter(
            edge => edge.target === file.filePath
        ).length;

        const outgoingDependencies = dependencyGraph.edges.filter(
            edge => edge.source === file.filePath
        ).length;

        const unresolvedCalls = callGraph.edges.filter(
            edge =>
                edge.filePath === file.filePath &&
                (
                    edge.resolution === "unresolved" ||
                    edge.resolution === "ambiguous"
                )
        ).length;

        const diagnostics = file.diagnostics.length;

        const circularDependency = circularFiles.has(file.filePath);

        const reasons: string[] = [];

        const fanInScore = Math.min(25, incomingDependencies * 5);
        const fanOutScore = Math.min(20, outgoingDependencies * 4);
        const unresolvedScore = Math.min(20, unresolvedCalls * 4);
        const diagnosticScore = Math.min(15, diagnostics * 3);
        const circularScore = circularDependency ? 20 : 0;

        if (incomingDependencies >= 5) {
            reasons.push("High number of dependent files.");
        }

        if (outgoingDependencies >= 5) {
            reasons.push("High number of imported files.");
        }

        if (unresolvedCalls > 0) {
            reasons.push(`${unresolvedCalls} unresolved or ambiguous calls.`);
        }

        if (diagnostics > 0) {
            reasons.push(`${diagnostics} parser diagnostics.`);
        }

        if (circularDependency) {
            reasons.push("Part of a circular dependency group.");
        }

        const score = clamp(
            fanInScore +
            fanOutScore +
            unresolvedScore +
            diagnosticScore +
            circularScore,
            0,
            100
        );

        const level: FileRisk["level"] =
            score >= 60 ? "high" :
                score >= 30 ? "medium" :
                    "low";

        return {
            filePath: file.filePath,
            score,
            level,
            reasons,
            incomingDependencies,
            outgoingDependencies,
            unresolvedCalls,
            diagnostics,
            circularDependency
        };
    }).sort((a, b) => b.score - a.score);
}