import type { QualityGateConfig, QualityGateResult } from "./workflow-types";
import type { SecurityReport } from "../security/security-types";
import type { DependencyHealthReport } from "../health/health-types";
import type { RepositoryAnalysis } from "../analyzer/analysis-types";

export function evaluateQualityGates(
    options: {
        security?: SecurityReport;
        dependencyHealth?: DependencyHealthReport;
        analysis: RepositoryAnalysis;
        config?: QualityGateConfig;
    }
): QualityGateResult {
    const config = options.config ?? {};
    const maxCriticalSecurity = config.maxCriticalSecurity ?? 0;
    const maxHighSecurity = config.maxHighSecurity ?? 0;
    const allowNewCircular = config.allowNewCircularDependencies ?? false;
    const maxArchitectureViolations = config.maxArchitectureViolations ?? 0;
    const maxUnresolvedLocal = config.maxUnresolvedLocalImports ?? 0;

    const criticalSecurity = options.security?.summary.severityDistribution.critical ?? 0;
    const highSecurity = options.security?.summary.severityDistribution.high ?? 0;
    const circularDependencies = options.dependencyHealth?.circularDependencyCount ?? 0;
    const unresolvedLocalImports = options.dependencyHealth?.unresolvedLocalImports.length ?? 0;
    const architectureViolations = options.analysis.findings.filter(
        f => f.ruleId === "architecture-violation"
    ).length;

    const failures: string[] = [];
    const warnings: string[] = [];

    if (criticalSecurity > maxCriticalSecurity) {
        failures.push(
            `Critical security findings (${criticalSecurity}) exceed maximum allowed (${maxCriticalSecurity}).`
        );
    }

    if (highSecurity > maxHighSecurity) {
        failures.push(
            `High severity security findings (${highSecurity}) exceed maximum allowed (${maxHighSecurity}).`
        );
    }

    if (!allowNewCircular && circularDependencies > 0) {
        failures.push(
            `Circular dependencies detected (${circularDependencies}). Quality gate requires 0 circular dependency groups.`
        );
    }

    if (architectureViolations > maxArchitectureViolations) {
        failures.push(
            `Architecture violations (${architectureViolations}) exceed threshold (${maxArchitectureViolations}).`
        );
    }

    if (unresolvedLocalImports > maxUnresolvedLocal) {
        failures.push(
            `Unresolved local imports (${unresolvedLocalImports}) exceed threshold (${maxUnresolvedLocal}).`
        );
    }

    // Warnings for medium security or dead code
    if ((options.security?.summary.severityDistribution.medium ?? 0) > 3) {
        warnings.push(
            `${options.security?.summary.severityDistribution.medium} medium-severity security findings detected.`
        );
    }

    const passed = failures.length === 0;

    return {
        passed,
        failures,
        warnings,
        metrics: {
            criticalSecurity,
            highSecurity,
            circularDependencies,
            architectureViolations,
            unresolvedLocalImports
        }
    };
}
