
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import type {
    AnalysisFinding,
    DeadCodeCandidate,
    FileRisk,
    SemanticAnalysis
} from "../analyzer/analysis-types";

export interface RuleContext {
    files: ParsedFile[];
    dependencyGraph: GraphResult;
    callGraph: CallGraphResult;
    semantic: SemanticAnalysis;
    deadCodeCandidates: DeadCodeCandidate[];
    risks: FileRisk[];
}

export interface AnalysisRule {
    id: string;
    evaluate(context: RuleContext): AnalysisFinding[];
}

export class RuleEngine {
    constructor(private readonly rules: AnalysisRule[]) { }

    evaluate(context: RuleContext): AnalysisFinding[] {
        const findings = this.rules.flatMap(rule =>
            rule.evaluate(context)
        );

        return findings.sort((a, b) => {
            const severityOrder = {
                critical: 0,
                high: 1,
                medium: 2,
                low: 3,
                info: 4
            };

            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }
}