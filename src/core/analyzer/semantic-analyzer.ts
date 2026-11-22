import type { CallGraphResult } from "../call-graph/call-graph-types";
import type {
    SemanticAnalysis,
    SymbolReference
} from "./analysis-types";

export function analyzeSemantics(
    graph: CallGraphResult
): SemanticAnalysis {
    const references = new Map<string, {
        count: number;
        callers: Set<string>;
    }>();

    let resolvedCallCount = 0;
    let unresolvedCallCount = 0;
    let ambiguousCallCount = 0;

    for (const edge of graph.edges) {
        if (edge.resolution === "resolved" && edge.target) {
            resolvedCallCount++;

            const current = references.get(edge.target) ?? {
                count: 0,
                callers: new Set<string>()
            };

            current.count++;

            if (edge.source) {
                current.callers.add(edge.source);
            }

            references.set(edge.target, current);
        } else if (edge.resolution === "ambiguous") {
            ambiguousCallCount++;
        } else if (edge.resolution === "unresolved") {
            unresolvedCallCount++;
        }
    }

    const result: SymbolReference[] = [...references.entries()]
        .map(([symbolId, value]) => ({
            symbolId,
            referenceCount: value.count,
            callers: [...value.callers]
        }))
        .sort((a, b) => a.symbolId.localeCompare(b.symbolId));

    return {
        references: result,
        unresolvedCallCount,
        ambiguousCallCount,
        resolvedCallCount
    };
}