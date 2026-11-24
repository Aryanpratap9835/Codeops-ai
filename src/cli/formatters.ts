import type { MachineReadableReport, ExplainReport } from "./cli-types";
import type { ArchitectureReport } from "../core/architecture/architecture-types";
import type { DependencyHealthReport } from "../core/health/health-types";
import type { HotspotReport } from "../core/analyzer/hotspot-analyzer";
import type { AdvancedImpactReport } from "../core/graph/graph-type";
import type { SecurityReport } from "../core/security/security-types";
import type { QualityGateResult, GitChangeSummary } from "../core/workflow/workflow-types";

export function formatAnalyzeReport(report: MachineReadableReport): string {
    const { repository, graph, architecture, dependencyHealth, hotspots, analysis, recommendations } = report;
    const { metrics, findings } = analysis;

    const lines: string[] = [
        "====================================",
        "       CodeOps Repository Analysis",
        "====================================",
        `Repository: ${repository.path}`,
        "",
        "[1] Repository Overview",
        "-----------------------",
        `Scanned files:          ${repository.scannedFiles}`,
        `Parsed files:           ${repository.parsedFiles}`,
        `Scan errors:            ${repository.scanErrors}`,
        `Parse errors:           ${repository.parseErrors}`,
        `Symbols:                ${metrics.symbolCount}`,
        `Functions:              ${metrics.functionCount}`,
        `Classes:                ${metrics.classCount}`,
        `Imports:                ${metrics.importCount}`,
        "",
        "[2] Architecture Summary",
        "-----------------------",
        `Detected layers:        ${architecture.layers.length}`,
        ...architecture.layers.map(l => `  - ${l.layer.padEnd(14)}: ${l.fileCount} file(s)`),
        `Unclassified files:     ${architecture.unclassifiedFiles.length} (${architecture.unclassifiedPercentage}%)`,
        "",
        "[3] Dependency Health",
        "---------------------",
        `Health score:           ${dependencyHealth.healthScore} / 100 (${dependencyHealth.status.toUpperCase()})`,
        `Circular dependencies:  ${dependencyHealth.circularDependencyCount}`,
        `Unresolved local imports: ${dependencyHealth.unresolvedLocalImports.length}`,
        `Fragile structures:     ${dependencyHealth.fragileStructures.length}`,
        "",
        "[4] Call Graph",
        "--------------",
        `Total calls:            ${metrics.callCount}`,
        `Resolved calls:         ${metrics.resolvedCallCount}`,
        `Unresolved calls:       ${metrics.unresolvedCallCount}`,
        `Ambiguous calls:        ${metrics.ambiguousCallCount}`,
        "",
        "[5] Hotspots & High Risk Files",
        "------------------------------",
        `Critical hotspots:      ${hotspots.criticalCount}`,
        `High risk hotspots:     ${hotspots.highCount}`,
        `Average risk score:     ${hotspots.averageScore} / 100`,
        ...hotspots.topHotspots.slice(0, 5).map(h =>
            `  - [${h.riskTier.toUpperCase()}] ${h.filePath} (Score: ${h.score})`
        ),
        "",
        `[6] Findings (${findings.length})`,
        "------------------"
    ];

    for (const finding of findings) {
        lines.push(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
        lines.push(`  Message: ${finding.message}`);
        if (finding.filePath) {
            lines.push(`  File:    ${finding.filePath}`);
        }
        for (const ev of finding.evidence) {
            lines.push(`    • ${ev}`);
        }
        lines.push("");
    }

    if (recommendations.length > 0) {
        lines.push("[7] Suggested Improvements");
        lines.push("--------------------------");
        for (const rec of recommendations) {
            lines.push(`  [${rec.priority.toUpperCase()}] ${rec.title}`);
            lines.push(`  ${rec.description}`);
            lines.push(`  Remediation: ${rec.remediation}`);
            lines.push("");
        }
    }

    lines.push("====================================");
    lines.push("          Analysis Complete");
    lines.push("====================================");

    return lines.join("\n");
}

export function formatArchitectureReport(report: ArchitectureReport): string {
    const lines: string[] = [
        "====================================",
        "      Architecture Detection Report",
        "====================================",
        `Detected Layers: ${report.layers.length}`,
        ""
    ];

    for (const layer of report.layers) {
        lines.push(`Layer: ${layer.layer.toUpperCase()} (${layer.fileCount} files)`);
        lines.push("------------------------------------");
        for (const file of layer.files) {
            lines.push(`  • ${file}`);
        }
        lines.push("");
    }

    if (report.layerDependencies.length > 0) {
        lines.push("Inter-Layer Dependencies:");
        lines.push("------------------------------------");
        for (const dep of report.layerDependencies) {
            lines.push(`  ${dep.sourceLayer} -> ${dep.targetLayer} (${dep.edgeCount} edge(s))`);
        }
        lines.push("");
    }

    if (report.unclassifiedFiles.length > 0) {
        lines.push(`Unclassified Files (${report.unclassifiedFiles.length}, ${report.unclassifiedPercentage}%):`);
        lines.push("------------------------------------");
        for (const file of report.unclassifiedFiles) {
            lines.push(`  • ${file}`);
        }
        lines.push("");
    }

    if (report.organizationIssues.length > 0) {
        lines.push("Architectural Issues:");
        lines.push("------------------------------------");
        for (const issue of report.organizationIssues) {
            lines.push(`  ! ${issue}`);
        }
    }

    return lines.join("\n");
}

export function formatHealthReport(report: DependencyHealthReport): string {
    const lines: string[] = [
        "====================================",
        "      Dependency Health Report",
        "====================================",
        `Health Score: ${report.healthScore} / 100`,
        `Status:       ${report.status.toUpperCase()}`,
        "",
        "Summary:",
        ...report.summary.map(s => `  • ${s}`),
        ""
    ];

    if (report.circularDependencyCount > 0) {
        lines.push(`Circular Dependency Groups (${report.circularDependencyCount}):`);
        lines.push("------------------------------------");
        for (let i = 0; i < report.circularDependencyGroups.length; i++) {
            const group = report.circularDependencyGroups[i]!;
            lines.push(`  Group #${i + 1}:`);
            for (const file of group) {
                lines.push(`    • ${file}`);
            }
        }
        lines.push("");
    }

    if (report.unresolvedLocalImports.length > 0) {
        lines.push(`Unresolved Local Imports (${report.unresolvedLocalImports.length}):`);
        lines.push("------------------------------------");
        for (const imp of report.unresolvedLocalImports) {
            lines.push(`  • In ${imp.importerFile}:${imp.location.line}:${imp.location.column}`);
            lines.push(`    Cannot resolve '${imp.specifier}'`);
            lines.push(`    Reason: ${imp.possibleReason}`);
        }
        lines.push("");
    }

    if (report.fragileStructures.length > 0) {
        lines.push(`Fragile Structures (${report.fragileStructures.length}):`);
        lines.push("------------------------------------");
        for (const frag of report.fragileStructures) {
            lines.push(`  [${frag.severity.toUpperCase()}] ${frag.description}`);
            if (frag.affectedFiles.length > 0) {
                lines.push(`    Involved files: ${frag.affectedFiles.slice(0, 3).join(", ")}`);
            }
        }
    }

    return lines.join("\n");
}

export function formatHotspotsReport(report: HotspotReport): string {
    const lines: string[] = [
        "====================================",
        "       Hotspot Ranking Report",
        "====================================",
        `Total Analyzed Files: ${report.hotspots.length}`,
        `Average Hotspot Score: ${report.averageScore} / 100`,
        `Critical: ${report.criticalCount} | High: ${report.highCount}`,
        "",
        "Ranked Hotspots:"
    ];

    for (let i = 0; i < report.topHotspots.length; i++) {
        const h = report.topHotspots[i]!;
        lines.push(`\n#${i + 1} [${h.riskTier.toUpperCase()}] ${h.filePath} (Score: ${h.score}/100)`);
        lines.push(`   Fan-in: ${h.fanIn} | Fan-out: ${h.fanOut} | Unresolved calls: ${h.unresolvedCalls} | Circular: ${h.circular}`);
        lines.push("   Contributing Factors:");
        for (const f of h.factors) {
            if (f.score > 0) {
                lines.push(`     • ${f.name.padEnd(18)}: +${f.score}/${f.maxScore} (${f.evidence})`);
            }
        }
    }

    return lines.join("\n");
}

export function formatImpactReport(report: AdvancedImpactReport): string {
    const lines: string[] = [
        "====================================",
        "        Change Impact Report",
        "====================================",
        `Target File:       ${report.changedFile}`,
        `Total Affected:    ${report.totalAffected}`,
        `Impact Depth:      ${report.impactDepth}`,
        `Direct Dependents: ${report.directDependents.length}`,
        `Indirect:          ${report.indirectDependents.length}`,
        ""
    ];

    if (report.directDependents.length > 0) {
        lines.push("Direct Dependents:");
        for (const d of report.directDependents) {
            lines.push(`  • ${d}`);
        }
        lines.push("");
    }

    if (report.indirectDependents.length > 0) {
        lines.push("Indirect / Transitive Dependents:");
        for (const ind of report.indirectDependents) {
            lines.push(`  • ${ind}`);
        }
        lines.push("");
    }

    if (report.affectedFunctions && report.affectedFunctions.length > 0) {
        lines.push(`Affected Functions (${report.affectedFunctions.length}):`);
        for (const fn of report.affectedFunctions) {
            lines.push(`  • In ${fn.filePath} -> function '${fn.name}' (calls '${fn.calleeName}')`);
        }
        lines.push("");
    }

    lines.push("Impact Explanations:");
    for (const expl of report.explanations) {
        lines.push(`  • [Depth ${expl.depth}] ${expl.filePath}: ${expl.explanation}`);
    }

    return lines.join("\n");
}

export function formatExplainReport(report: ExplainReport): string {
    const lines: string[] = [
        "====================================",
        "      Module Explanation Report",
        "====================================",
        `File:             ${report.filePath}`,
        `Layer:            ${report.layer} (${report.confidence} confidence)`,
        `Risk Tier:        ${report.riskLevel.toUpperCase()} (Score: ${report.riskScore}/100)`,
        `Coupling:         Fan-in: ${report.coupling.fanIn}, Fan-out: ${report.coupling.fanOut}, Instability: ${report.coupling.instability}`,
        `Direct Dependents: ${report.impact.directDependents.length} (Total Affected: ${report.impact.totalAffected}, Depth: ${report.impact.depth})`,
        "",
        "Overview:",
        `  ${report.explanation}`,
        ""
    ];

    if (report.findings.length > 0) {
        lines.push(`Findings in this file (${report.findings.length}):`);
        lines.push("------------------------------------");
        for (const f of report.findings) {
            lines.push(`  [${f.severity.toUpperCase()}] ${f.title}`);
            lines.push(`  ${f.message}`);
            if (f.remediation) {
                lines.push(`  Remediation: ${f.remediation}`);
            }
            lines.push("");
        }
    } else {
        lines.push("No architecture violations or critical findings detected in this file.");
        lines.push("");
    }

    if (report.recommendations.length > 0) {
        lines.push("Recommendations:");
        lines.push("------------------------------------");
        for (const rec of report.recommendations) {
            lines.push(`  • ${rec}`);
        }
    }

    return lines.join("\n");
}

export function formatSecurityReport(report: SecurityReport): string {
    const { summary, findings } = report;
    const lines: string[] = [
        "====================================",
        "      Security Intelligence Report",
        "====================================",
        `Security Score: ${summary.score} / 100 (Grade: ${summary.grade})`,
        `Total Findings: ${summary.totalFindings}`,
        `Severity Breakdown:`,
        `  • Critical: ${summary.severityDistribution.critical}`,
        `  • High:     ${summary.severityDistribution.high}`,
        `  • Medium:   ${summary.severityDistribution.medium}`,
        `  • Low:      ${summary.severityDistribution.low}`,
        `  • Info:     ${summary.severityDistribution.info}`,
        ""
    ];

    if (summary.mostDangerousFiles.length > 0) {
        lines.push("Most Vulnerable Files:");
        for (const file of summary.mostDangerousFiles.slice(0, 5)) {
            lines.push(`  • [${file.maxSeverity.toUpperCase()}] ${file.filePath} (${file.findingCount} issue(s))`);
        }
        lines.push("");
    }

    if (findings.length > 0) {
        lines.push(`Detailed Findings (${findings.length}):`);
        lines.push("------------------------------------");
        for (const f of findings) {
            lines.push(`  [${f.severity.toUpperCase()}] ${f.title} (${f.ruleId})`);
            lines.push(`  Location:    ${f.filePath}${f.location ? `:${f.location.line}:${f.location.column}` : ""}`);
            lines.push(`  Category:    ${f.category} | Confidence: ${f.confidence}`);
            if (f.cwe) lines.push(`  CWE / OWASP: ${f.cwe} | ${f.owasp ?? "N/A"}`);
            lines.push(`  Message:     ${f.message}`);
            for (const ev of f.evidence) {
                lines.push(`    • ${ev}`);
            }
            lines.push(`  Remediation: ${f.remediation}`);
            lines.push("");
        }
    } else {
        lines.push("No security vulnerabilities or exposed secrets detected.");
    }

    return lines.join("\n");
}

export function formatCheckReport(
    gateResult: QualityGateResult,
    gitChanges: GitChangeSummary
): string {
    const statusText = gateResult.passed ? "PASSED" : "FAILED";
    const lines: string[] = [
        "====================================",
        "     CodeOps CI Quality Check",
        "====================================",
        `Quality Gate: ${statusText}`,
        `Git Status:   ${gitChanges.isGitRepo ? `Branch '${gitChanges.currentBranch ?? "unknown"}'` : "Not a git repository"}`
    ];

    if (gitChanges.changedFiles.length > 0) {
        lines.push(`Changed Files (${gitChanges.changedFiles.length}):`);
        for (const c of gitChanges.changedFiles.slice(0, 8)) {
            lines.push(`  • [${c.status.toUpperCase()}] ${c.filePath}`);
        }
        if (gitChanges.changedFiles.length > 8) {
            lines.push(`  ... and ${gitChanges.changedFiles.length - 8} more`);
        }
    }
    lines.push("");

    lines.push("Quality Gate Metrics:");
    lines.push("------------------------------------");
    lines.push(`  • Critical Security Findings: ${gateResult.metrics.criticalSecurity}`);
    lines.push(`  • High Security Findings:     ${gateResult.metrics.highSecurity}`);
    lines.push(`  • Circular Dependency Groups: ${gateResult.metrics.circularDependencies}`);
    lines.push(`  • Architecture Violations:    ${gateResult.metrics.architectureViolations}`);
    lines.push(`  • Unresolved Local Imports:   ${gateResult.metrics.unresolvedLocalImports}`);
    lines.push("");

    if (gateResult.failures.length > 0) {
        lines.push("Failures (Caused Gate to Fail):");
        lines.push("------------------------------------");
        for (const fail of gateResult.failures) {
            lines.push(`  ✕ ${fail}`);
        }
        lines.push("");
    }

    if (gateResult.warnings.length > 0) {
        lines.push("Warnings:");
        lines.push("------------------------------------");
        for (const warn of gateResult.warnings) {
            lines.push(`  ! ${warn}`);
        }
        lines.push("");
    }

    lines.push("====================================");
    return lines.join("\n");
}

export function formatAiReviewReport(review: import("../core/ai/ai-types").ReviewResult): string {
    const lines: string[] = [
        "====================================",
        "     CodeOps AI Code Review",
        "====================================",
        `Overall Assessment: [${review.overallAssessment.toUpperCase()}]`,
        `Changed Files:      ${review.changedFilesCount}`,
        `Total Comments:     ${review.comments.length}`,
        "",
        "Summary:",
        review.summary,
        ""
    ];

    if (review.comments.length > 0) {
        lines.push("Review Comments:");
        lines.push("------------------------------------");
        for (const c of review.comments) {
            lines.push(`  [${c.severity.toUpperCase()}] ${c.filePath}${c.line ? `:${c.line}` : ""}`);
            lines.push(`  Message:    ${c.message}`);
            if (c.suggestion) {
                lines.push(`  Suggestion: ${c.suggestion}`);
            }
            lines.push("");
        }
    }

    if (review.risksIdentified.length > 0) {
        lines.push("Identified Risks:");
        for (const r of review.risksIdentified) {
            lines.push(`  • ${r}`);
        }
        lines.push("");
    }

    lines.push("====================================");
    return lines.join("\n");
}

export function formatAiFixReport(suggestion: import("../core/ai/ai-types").DiffSuggestion): string {
    const lines: string[] = [
        "====================================",
        "     CodeOps AI Fix Proposal",
        "====================================",
        `Target File:     ${suggestion.filePath}`,
        `Safety Status:   ${suggestion.safetyApproved ? "APPROVED" : "REJECTED"}`,
        `Rationale:       ${suggestion.rationale}`,
        ""
    ];

    if (suggestion.safetyNotes && suggestion.safetyNotes.length > 0) {
        lines.push("Safety Verification:");
        for (const note of suggestion.safetyNotes) {
            lines.push(`  • ${note}`);
        }
        lines.push("");
    }

    lines.push("Proposed Unified Diff (Not written to disk):");
    lines.push("------------------------------------");
    lines.push(suggestion.unifiedDiff);
    lines.push("------------------------------------");
    lines.push("Review the diff above and apply manually or with git apply.");
    lines.push("====================================");
    return lines.join("\n");
}

export function formatAiExplainReport(data: { finding: any; explanation: string; model: string }): string {
    const lines: string[] = [
        "====================================",
        "   CodeOps AI Finding Explanation",
        "====================================",
        `Finding:     ${data.finding.id ?? "N/A"} - ${data.finding.title ?? "Finding"}`,
        `File:        ${data.finding.filePath ?? "N/A"}`,
        `Model:       ${data.model}`,
        "",
        "Detailed AI Explanation:",
        "------------------------------------",
        data.explanation,
        "===================================="
    ];
    return lines.join("\n");
}

