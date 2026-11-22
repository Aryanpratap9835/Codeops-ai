
import type { AnalysisRule } from "./rule-engine";

export const unusedSymbolRule: AnalysisRule = {
    id: "unused-symbol",

    evaluate(context) {
        return context.deadCodeCandidates.map(candidate => ({
            id: `unused-symbol:${candidate.symbolId}`,
            ruleId: "unused-symbol",
            category: "dead-code",
            severity: "low",
            title: "Possible unused function",
            message: `${candidate.qualifiedName} has no statically resolved callers.`,
            filePath: candidate.filePath,
            location: candidate.location,
            evidence: [
                candidate.reason,
                `Symbol ID: ${candidate.symbolId}`
            ]
        }));
    }
};