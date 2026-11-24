import type { ParseError } from "../parser/parser-types";
import type { AnalysisInput, RepositoryAnalysis } from "../analyzer/analysis-types";

import { analyzeSemantics } from "../analyzer/semantic-analyzer";
import { findDeadCodeCandidates } from "../analyzer/dead-code-analyzer";
import { calculateRepositoryMetrics } from "../analyzer/metrics-analyzer";
import { analyzeFileRisks } from "../analyzer/risk-analyzer";
import { detectArchitecture } from "../architecture/architecture-detector";
import { analyzeModuleCoupling } from "../coupling/coupling-analyzer";
import { analyzeDependencyHealth } from "../health/dependency-health";
import { detectHotspots } from "../analyzer/hotspot-analyzer";

import { RuleEngine } from "../rules/rule-engine";
import { unusedSymbolRule } from "../rules/unused-symbol.rule";
import { circularDependencyRule } from "../rules/circular-dependency.rule";
import { fileRiskRule } from "../rules/file-risk.rule";
import { callResolutionRule } from "../rules/call-resolution.rule";
import { architectureViolationRule } from "../rules/architecture-violation.rule";

const ruleEngine = new RuleEngine([
    unusedSymbolRule,
    circularDependencyRule,
    fileRiskRule,
    callResolutionRule,
    architectureViolationRule
]);

export function analyzeRepository(
    input: AnalysisInput,
    parseErrors: ParseError[] = [],
    rootPath: string = process.cwd()
): RepositoryAnalysis {
    const {
        files,
        dependencyGraph,
        callGraph
    } = input;

    const semantic = analyzeSemantics(callGraph);

    const deadCodeCandidates = findDeadCodeCandidates(
        files,
        callGraph
    );

    const metrics = calculateRepositoryMetrics(
        files,
        dependencyGraph,
        callGraph,
        deadCodeCandidates
    );

    const risks = analyzeFileRisks(
        files,
        dependencyGraph,
        callGraph
    );

    const architecture = detectArchitecture(
        files.map(f => f.filePath),
        dependencyGraph
    );

    const coupling = analyzeModuleCoupling(dependencyGraph);

    const dependencyHealth = analyzeDependencyHealth(
        rootPath,
        files,
        dependencyGraph
    );

    const hotspots = detectHotspots(
        files,
        dependencyGraph,
        callGraph
    );

    const findings = ruleEngine.evaluate({
        files,
        dependencyGraph,
        callGraph,
        semantic,
        deadCodeCandidates,
        risks
    });

    return {
        metrics,
        semantic,
        deadCodeCandidates,
        risks,
        findings,
        architecture,
        coupling,
        dependencyHealth,
        hotspots,
        parseErrors: parseErrors.map(error => ({
            filePath: error.filePath,
            code: error.code,
            message: error.message
        }))
    };
}
