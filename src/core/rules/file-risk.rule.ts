
import type { AnalysisRule } from "./rule-engine";

export const fileRiskRule: AnalysisRule = {
    id: "file-risk",

    evaluate(context) {
        return context.risks
            .filter(risk => risk.level === "high" || risk.level === "medium")
            .map(risk => ({
                id: `file-risk:${risk.filePath}`,
                ruleId: "file-risk",
                category: "risk",
                severity: risk.level,
                title: `${risk.level === "high" ? "High" : "Medium"} risk file`,
                message: `Risk score: ${risk.score}/100.`,
                filePath: risk.filePath,
                location: null,
                evidence: risk.reasons.length > 0
                    ? risk.reasons
                    : ["Risk score is based on repository structure."]
            }));
    }
};