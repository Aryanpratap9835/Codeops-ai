import type { AnalysisRule } from "./rule-engine";

export const callResolutionRule: AnalysisRule = {
    id: "call-resolution",

    evaluate(context) {
        return context.callGraph.edges
            .filter(edge =>
                edge.resolution === "unresolved" ||
                edge.resolution === "ambiguous"
            )
            .map(edge => {
                const ambiguous = edge.resolution === "ambiguous";

                return {
                    id: `call-resolution:${edge.id}`,
                    ruleId: "call-resolution",
                    category: "call-resolution",
                    severity: ambiguous ? "medium" as const : "info" as const,
                    title: ambiguous
                        ? "Ambiguous function call"
                        : "Unresolved function call",
                    message: edge.reason ??
                        "The static analyzer could not resolve this call.",
                    filePath: edge.filePath,
                    location: edge.location,
                    evidence: [
                        `Callee: ${edge.callee}`,
                        `Resolution: ${edge.resolution}`
                    ]
                };
            });
    }
};