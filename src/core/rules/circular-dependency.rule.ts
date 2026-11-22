
import { findCircularDependencyGroups } from "./../graph/graph-analysis";
import type { AnalysisRule } from "./rule-engine";

export const circularDependencyRule: AnalysisRule = {
    id: "circular-dependency",

    evaluate(context) {
        const groups = findCircularDependencyGroups(
            context.dependencyGraph
        );

        return groups.map((group, index) => ({
            id: `circular-dependency:${index}`,
            ruleId: "circular-dependency",
            category: "dependency",
            severity: "high",
            title: "Circular dependency detected",
            message: `${group.length} files form a circular dependency group.`,
            filePath: null,
            location: null,
            evidence: group
        }));
    }
};