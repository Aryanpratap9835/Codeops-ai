import * as path from "node:path";
import * as fs from "node:fs";

import { scanRepository } from "../core/repository/scanner";
import { parseRepository } from "../core/parser/parser";
import { buildDependencyGraph } from "../core/graph/graph-builder";
import { buildCallGraph } from "../core/call-graph/call-graph-builder";
import { analyzeRepository } from "../core/rules/analysis-engine";
import { detectArchitecture, classifyFile } from "../core/architecture/architecture-detector";
import { analyzeModuleCoupling } from "../core/coupling/coupling-analyzer";
import { analyzeDependencyHealth } from "../core/health/dependency-health";
import { detectHotspots } from "../core/analyzer/hotspot-analyzer";
import { getAdvancedImpactReport } from "../core/graph/graph-analysis";
import { analyzeSecurity } from "../core/security/security-engine";
import { CacheManager } from "../core/cache/cache-manager";
import { profileRepositoryAnalysis, formatProfileReport } from "../core/cache/profiler";

import {
    CODEOPS_SCHEMA_VERSION,
    MachineReadableReport,
    CodeOpsRecommendation,
    ExplainReport
} from "./cli-types";
import {
    formatAnalyzeReport,
    formatArchitectureReport,
    formatHealthReport,
    formatHotspotsReport,
    formatImpactReport,
    formatExplainReport,
    formatSecurityReport,
    formatCheckReport,
    formatAiExplainReport,
    formatAiFixReport,
    formatAiReviewReport
} from "./formatters";
import { getGitChanges } from "../core/workflow/git-integration";
import { evaluateQualityGates } from "../core/workflow/quality-gates";
import { exportToSarif } from "../core/workflow/sarif-exporter";
import { startServer } from "../server/server";
import { explainFinding } from "../core/ai/explanation-engine";
import { generateFixSuggestion } from "../core/ai/fix-generator";
import { reviewCodeChanges } from "../core/ai/code-reviewer";

export function printHelp(): void {
    console.log(`
====================================
           CodeOps CLI
====================================

CodeOps is an intelligent repository intelligence and static analysis engine.

Usage:
  codeops <command> <repository-path> [arguments] [options]

Commands:
  analyze        Perform full static analysis and intelligence on the repository
  check          Run CI quality gate check and git change analysis
  architecture   Detect and inspect architectural layers and cross-layer dependencies
  dependencies   Inspect dependency graph, cycles, and unresolved local imports
  impact         Analyze direct and transitive change impact of a modified file
  hotspots       Rank risky modules with a transparent multi-factor hotspot breakdown
  health         Generate dependency health metrics, stability, and fragility report
  security       Analyze repository for exposed secrets, injection, and crypto flaws
  serve          Start interactive web dashboard and REST API server
  profile        Measure execution timings, cache hit rate, and memory usage
  cache clear    Clear analysis cache for the target repository
  explain        Provide deep explainability, findings, and remediation for a file
  ai explain     AI-powered deep root cause explanation and remediation for a finding
  ai fix         AI-powered safe fix proposal generating a unified diff (no disk overwrite)
  ai review      AI-powered intelligent code review of git working tree changes
  help           Display this help message

Options:
  --json         Strict machine-readable JSON output (clean stdout, no logging)
  --sarif        Export findings in OASIS SARIF 2.1.0 JSON format
  --base <ref>   Base git reference/branch to compare changes against (for check)
  --fail-on <sev> Quality gate failure severity threshold (critical, high, medium)
  --help, -h     Show command usage instructions

Examples:
  codeops analyze ./test-repo
  codeops analyze . --json
  codeops architecture .
  codeops dependencies ./test-repo
  codeops impact ./test-repo src/services/user.ts
  codeops hotspots .
  codeops health ./test-repo
  codeops explain ./test-repo src/app.ts
`);
}

export async function runFullAnalysis(rootPath: string): Promise<{
    scanResult: Awaited<ReturnType<typeof scanRepository>>;
    parseResult: Awaited<ReturnType<typeof parseRepository>>;
    dependencyGraph: ReturnType<typeof buildDependencyGraph>;
    callGraph: ReturnType<typeof buildCallGraph>;
    analysis: ReturnType<typeof analyzeRepository>;
    report: MachineReadableReport;
}> {
    const scanResult = await scanRepository(rootPath);
    const parseResult = await parseRepository(rootPath, scanResult.files);
    const dependencyGraph = buildDependencyGraph(rootPath, parseResult.files);
    const callGraph = buildCallGraph(parseResult.files, rootPath);

    const analysis = analyzeRepository(
        {
            files: parseResult.files,
            dependencyGraph,
            callGraph
        },
        parseResult.errors,
        rootPath
    );

    const architecture = analysis.architecture ?? detectArchitecture(
        parseResult.files.map(f => f.filePath),
        dependencyGraph
    );

    const coupling = analysis.coupling ?? analyzeModuleCoupling(dependencyGraph);

    const dependencyHealth = analysis.dependencyHealth ?? analyzeDependencyHealth(
        rootPath,
        parseResult.files,
        dependencyGraph
    );

    const hotspots = analysis.hotspots ?? detectHotspots(
        parseResult.files,
        dependencyGraph,
        callGraph
    );

    const security = analyzeSecurity(
        parseResult.files.map(f => ({ filePath: f.filePath }))
    );

    // Build actionable recommendations
    const recommendations: CodeOpsRecommendation[] = [];

    if (dependencyHealth.circularDependencyCount > 0) {
        recommendations.push({
            category: "dependency",
            priority: "high",
            title: "Eliminate circular dependency groups",
            description: `Found ${dependencyHealth.circularDependencyCount} circular cycle group(s) which cause tightly coupled modules and fragile initialization.`,
            targetFiles: dependencyHealth.circularDependencyGroups.flat(),
            remediation: "Break the cycles by extracting shared types, interfaces, or helper functions into an independent module."
        });
    }

    if (dependencyHealth.unresolvedLocalImports.length > 0) {
        recommendations.push({
            category: "maintainability",
            priority: "high",
            title: "Fix missing local module imports",
            description: `Detected ${dependencyHealth.unresolvedLocalImports.length} local import(s) that cannot be resolved to any file in the repository.`,
            targetFiles: dependencyHealth.unresolvedLocalImports.map(u => u.importerFile),
            remediation: "Ensure the referenced files exist and verify relative path specifiers and tsconfig path aliases."
        });
    }

    const archFindings = analysis.findings.filter(f => f.ruleId === "architecture-violation");
    if (archFindings.length > 0) {
        recommendations.push({
            category: "architecture",
            priority: "high",
            title: "Enforce architectural layer boundaries",
            description: `Detected ${archFindings.length} architectural violation(s) crossing prohibited layer boundaries.`,
            targetFiles: archFindings.map(f => f.filePath).filter((f): f is string => Boolean(f)),
            remediation: "Refactor dependencies to follow layered architecture (e.g. controllers -> services -> repositories)."
        });
    }

    if (hotspots.criticalCount > 0) {
        recommendations.push({
            category: "risk",
            priority: "medium",
            title: "Refactor critical structural hotspots",
            description: `${hotspots.criticalCount} module(s) have critical risk scores due to excessive coupling, circularity, or unresolved calls.`,
            targetFiles: hotspots.topHotspots.filter(h => h.riskTier === "critical").map(h => h.filePath),
            remediation: "Split large multi-responsibility modules, reduce incoming/outgoing dependencies, and isolate key abstractions."
        });
    }

    const machineReport: MachineReadableReport = {
        schemaVersion: CODEOPS_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        repository: {
            path: rootPath,
            scannedFiles: scanResult.files.length,
            parsedFiles: parseResult.files.length,
            scanErrors: scanResult.errors.length,
            parseErrors: parseResult.errors.length
        },
        graph: {
            nodeCount: dependencyGraph.nodes.length,
            edgeCount: dependencyGraph.edges.length,
            cyclesCount: dependencyHealth.circularDependencyCount,
            sccCount: dependencyHealth.circularDependencyGroups.length
        },
        architecture,
        coupling,
        dependencyHealth,
        hotspots,
        security,
        analysis,
        recommendations
    };

    return {
        scanResult,
        parseResult,
        dependencyGraph,
        callGraph,
        analysis,
        report: machineReport
    };
}

export async function executeCommand(args: string[]): Promise<number> {
    const command = args[0];

    if (!command || command === "help" || command === "--help" || command === "-h") {
        printHelp();
        return 0;
    }

    const jsonOutput = args.includes("--json");
    const filteredArgs = args.slice(1).filter(a => a !== "--json");

    if (command === "ai") {
        const subCmd = filteredArgs[0];
        const repoArg = filteredArgs[1];

        if (!subCmd || (subCmd !== "explain" && subCmd !== "fix" && subCmd !== "review")) {
            console.error("Error: Unknown or missing AI subcommand. Supported: 'explain', 'fix', 'review'");
            return 1;
        }

        if (!repoArg || repoArg.startsWith("-")) {
            console.error("Error: Missing repository path argument for AI command.");
            return 1;
        }

        const rootPath = path.resolve(process.cwd(), repoArg);
        if (!fs.existsSync(rootPath)) {
            console.error(`Error: Repository path does not exist: '${rootPath}'`);
            return 1;
        }

        if (subCmd === "explain") {
            const findingId = filteredArgs[2];
            if (!findingId) {
                console.error("Error: Missing finding ID or file path for AI explain.");
                return 1;
            }

            const { parseResult, dependencyGraph, callGraph, analysis, report } = await runFullAnalysis(rootPath);
            const allFindings = [
                ...(report.security?.findings.map(f => ({
                    id: f.id,
                    filePath: f.filePath,
                    title: f.title,
                    message: f.message,
                    severity: f.severity,
                    evidence: Array.isArray(f.evidence) ? f.evidence.join("; ") : String(f.evidence)
                })) ?? []),
                ...analysis.findings.filter(f => f.filePath !== null).map(f => ({
                    id: f.id,
                    filePath: f.filePath as string,
                    title: f.title,
                    message: f.message,
                    severity: f.severity,
                    evidence: Array.isArray(f.evidence) ? f.evidence.join("; ") : String(f.evidence)
                }))
            ];

            try {
                const result = await explainFinding(
                    findingId,
                    rootPath,
                    parseResult.files,
                    dependencyGraph,
                    callGraph,
                    allFindings
                );

                if (jsonOutput) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(formatAiExplainReport(result));
                }
                return 0;
            } catch (err) {
                console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
                return 1;
            }
        }

        if (subCmd === "fix") {
            const findingId = filteredArgs[2];
            if (!findingId) {
                console.error("Error: Missing finding ID for AI fix.");
                return 1;
            }

            const { parseResult, dependencyGraph, callGraph, analysis, report } = await runFullAnalysis(rootPath);
            const allFindings = [
                ...(report.security?.findings.map(f => ({
                    id: f.id,
                    filePath: f.filePath,
                    title: f.title,
                    message: f.message,
                    severity: f.severity,
                    evidence: Array.isArray(f.evidence) ? f.evidence.join("; ") : String(f.evidence)
                })) ?? []),
                ...analysis.findings.filter(f => f.filePath !== null).map(f => ({
                    id: f.id,
                    filePath: f.filePath as string,
                    title: f.title,
                    message: f.message,
                    severity: f.severity,
                    evidence: Array.isArray(f.evidence) ? f.evidence.join("; ") : String(f.evidence)
                }))
            ];

            try {
                const diff = await generateFixSuggestion(
                    findingId,
                    rootPath,
                    parseResult.files,
                    dependencyGraph,
                    callGraph,
                    allFindings
                );

                if (jsonOutput) {
                    console.log(JSON.stringify(diff, null, 2));
                } else {
                    console.log(formatAiFixReport(diff));
                }
                return 0;
            } catch (err) {
                console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
                return 1;
            }
        }

        if (subCmd === "review") {
            let baseRef: string | undefined;
            const baseIdx = args.findIndex(a => a === "--base");
            if (baseIdx !== -1 && args[baseIdx + 1]) {
                baseRef = args[baseIdx + 1];
            }

            const review = await reviewCodeChanges(rootPath, baseRef);

            if (jsonOutput) {
                console.log(JSON.stringify(review, null, 2));
            } else {
                console.log(formatAiReviewReport(review));
            }
            return review.overallAssessment === "request_changes" ? 1 : 0;
        }
    }

    const repoArg = filteredArgs[0];

    if (!repoArg || repoArg.startsWith("-")) {
        console.error("Error: Missing repository path argument.");
        if (!jsonOutput) {
            printHelp();
        }
        return 1;
    }

    const rootPath = path.resolve(process.cwd(), repoArg);

    if (!fs.existsSync(rootPath)) {
        console.error(`Error: Repository path does not exist: '${rootPath}'`);
        return 1;
    }

    if (!jsonOutput && command !== "analyze") {
        // Output progress or headers only in non-JSON mode
    }

    switch (command) {
        case "analyze": {
            const { report, analysis } = await runFullAnalysis(rootPath);
            if (args.includes("--sarif")) {
                const sarif = exportToSarif({
                    securityFindings: report.security?.findings,
                    analysisFindings: analysis.findings
                });
                console.log(JSON.stringify(sarif, null, 2));
                return 0;
            }
            if (jsonOutput) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                console.log(formatAnalyzeReport(report));
            }
            return 0;
        }

        case "check": {
            const baseIdx = args.indexOf("--base");
            const baseBranch = baseIdx !== -1 ? args[baseIdx + 1] : undefined;

            const failOnIdx = args.indexOf("--fail-on");
            const failOnSev = failOnIdx !== -1 ? args[failOnIdx + 1] : undefined;

            const { report, analysis } = await runFullAnalysis(rootPath);
            const gitChanges = getGitChanges(rootPath, baseBranch);

            const gateResult = evaluateQualityGates({
                security: report.security,
                dependencyHealth: report.dependencyHealth,
                analysis,
                config: {
                    failOnSeverity: (failOnSev as any) ?? "high"
                }
            });

            if (args.includes("--sarif")) {
                const sarif = exportToSarif({
                    securityFindings: report.security?.findings,
                    analysisFindings: analysis.findings
                });
                console.log(JSON.stringify(sarif, null, 2));
                return gateResult.passed ? 0 : 1;
            }

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    git: gitChanges,
                    qualityGate: gateResult
                }, null, 2));
            } else {
                console.log(formatCheckReport(gateResult, gitChanges));
            }

            return gateResult.passed ? 0 : 1;
        }

        case "architecture": {
            const scanResult = await scanRepository(rootPath);
            const parseResult = await parseRepository(rootPath, scanResult.files);
            const dependencyGraph = buildDependencyGraph(rootPath, parseResult.files);
            const arch = detectArchitecture(parseResult.files.map(f => f.filePath), dependencyGraph);

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    architecture: arch
                }, null, 2));
            } else {
                console.log(formatArchitectureReport(arch));
            }
            return 0;
        }

        case "dependencies": {
            const scanResult = await scanRepository(rootPath);
            const parseResult = await parseRepository(rootPath, scanResult.files);
            const dependencyGraph = buildDependencyGraph(rootPath, parseResult.files);
            const health = analyzeDependencyHealth(rootPath, parseResult.files, dependencyGraph);

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    graph: dependencyGraph,
                    health
                }, null, 2));
            } else {
                console.log(formatHealthReport(health));
            }
            return 0;
        }

        case "health": {
            const scanResult = await scanRepository(rootPath);
            const parseResult = await parseRepository(rootPath, scanResult.files);
            const dependencyGraph = buildDependencyGraph(rootPath, parseResult.files);
            const health = analyzeDependencyHealth(rootPath, parseResult.files, dependencyGraph);

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    health
                }, null, 2));
            } else {
                console.log(formatHealthReport(health));
            }
            return 0;
        }

        case "hotspots": {
            const scanResult = await scanRepository(rootPath);
            const parseResult = await parseRepository(rootPath, scanResult.files);
            const dependencyGraph = buildDependencyGraph(rootPath, parseResult.files);
            const callGraph = buildCallGraph(parseResult.files, rootPath);
            const hotspots = detectHotspots(parseResult.files, dependencyGraph, callGraph);

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    hotspots
                }, null, 2));
            } else {
                console.log(formatHotspotsReport(hotspots));
            }
            return 0;
        }

        case "security": {
            const scanResult = await scanRepository(rootPath);
            const parseResult = await parseRepository(rootPath, scanResult.files);
            const rawReport = analyzeSecurity(
                parseResult.files.map(f => ({ filePath: f.filePath }))
            );

            let filteredFindings = rawReport.findings;

            const sevIndex = args.indexOf("--severity");
            if (sevIndex !== -1 && args[sevIndex + 1]) {
                const targetSev = args[sevIndex + 1]!.toLowerCase();
                filteredFindings = filteredFindings.filter(f => f.severity === targetSev);
            }

            const catIndex = args.indexOf("--category");
            if (catIndex !== -1 && args[catIndex + 1]) {
                const targetCat = args[catIndex + 1]!.toLowerCase();
                filteredFindings = filteredFindings.filter(f => f.category === targetCat);
            }

            const explainIndex = args.indexOf("--explain");
            if (explainIndex !== -1 && args[explainIndex + 1]) {
                const targetRule = args[explainIndex + 1]!;
                filteredFindings = filteredFindings.filter(f => f.ruleId === targetRule);
            }

            const finalReport = {
                findings: filteredFindings,
                summary: {
                    ...rawReport.summary,
                    totalFindings: filteredFindings.length
                }
            };

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    security: finalReport
                }, null, 2));
            } else {
                console.log(formatSecurityReport(finalReport));
            }
            return 0;
        }

        case "profile": {
            const profile = await profileRepositoryAnalysis(rootPath, {
                useCache: !args.includes("--no-cache")
            });

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    profile
                }, null, 2));
            } else {
                console.log(formatProfileReport(profile));
            }
            return 0;
        }

        case "cache": {
            const subAction = filteredArgs[1];
            if (subAction === "clear") {
                const mgr = new CacheManager(rootPath);
                const cleared = mgr.clearCache();
                if (jsonOutput) {
                    console.log(JSON.stringify({
                        schemaVersion: CODEOPS_SCHEMA_VERSION,
                        repository: rootPath,
                        cleared
                    }, null, 2));
                } else {
                    console.log(cleared ? "Cache cleared successfully." : "No existing cache found.");
                }
                return 0;
            }

            console.error("Unknown cache action. Usage: codeops cache clear <path>");
            return 1;
        }

        case "impact": {
            const targetFileArg = filteredArgs[1];
            if (!targetFileArg) {
                console.error("Error: Missing target file argument for impact analysis.");
                console.error("Usage: codeops impact <repository-path> <file-path> [--json]");
                return 1;
            }

            const scanResult = await scanRepository(rootPath);
            const parseResult = await parseRepository(rootPath, scanResult.files);
            const dependencyGraph = buildDependencyGraph(rootPath, parseResult.files);
            const callGraph = buildCallGraph(parseResult.files, rootPath);

            // Normalize target file relative to rootPath or as matching filePath
            const normalizedTarget = targetFileArg.replace(/\\/g, "/");
            const matchedFile = parseResult.files.find(f => {
                const norm = f.filePath.replace(/\\/g, "/");
                return norm === normalizedTarget || norm.endsWith(normalizedTarget);
            });

            const resolvedTarget = matchedFile ? matchedFile.filePath : targetFileArg;

            const impact = getAdvancedImpactReport(dependencyGraph, resolvedTarget, {
                callGraph
            });

            if (jsonOutput) {
                console.log(JSON.stringify({
                    schemaVersion: CODEOPS_SCHEMA_VERSION,
                    repository: rootPath,
                    impact
                }, null, 2));
            } else {
                console.log(formatImpactReport(impact));
            }
            return 0;
        }

        case "serve": {
            let port = 3000;
            const portIdx = args.findIndex(a => a === "--port");
            if (portIdx !== -1 && args[portIdx + 1]) {
                const parsedPort = parseInt(args[portIdx + 1], 10);
                if (!isNaN(parsedPort)) {
                    port = parsedPort;
                }
            }

            const server = await startServer(rootPath, port);
            const address = server.address();
            const actualPort = typeof address === "object" && address ? address.port : port;

            if (jsonOutput) {
                console.log(JSON.stringify({ status: "running", port: actualPort, url: `http://localhost:${actualPort}` }, null, 2));
            } else {
                console.log(`CodeOps Web Dashboard running at http://localhost:${actualPort}`);
            }

            if (args.includes("--test-mode")) {
                await new Promise<void>((resolve) => server.close(() => resolve()));
                return 0;
            }

            await new Promise<void>((resolve) => {
                process.once("SIGINT", () => server.close(() => resolve()));
                process.once("SIGTERM", () => server.close(() => resolve()));
            });
            return 0;
        }

        case "explain": {
            const targetFileArg = filteredArgs[1];
            if (!targetFileArg) {
                console.error("Error: Missing target file argument for explain command.");
                console.error("Usage: codeops explain <repository-path> <file-path> [--json]");
                return 1;
            }

            const { report, dependencyGraph, callGraph, parseResult } = await runFullAnalysis(rootPath);

            const matchedFile = parseResult.files.find(f => {
                const norm = f.filePath.replace(/\\/g, "/");
                const targetNorm = targetFileArg.replace(/\\/g, "/");
                return norm === targetNorm || norm.endsWith(targetNorm);
            });

            const targetFilePath = matchedFile ? matchedFile.filePath : targetFileArg;

            const classification = classifyFile(targetFilePath);
            const couplingMetric = report.coupling.modules.find(m => m.filePath === targetFilePath) ?? {
                filePath: targetFilePath,
                fanIn: 0,
                fanOut: 0,
                incomingDependencies: [],
                outgoingDependencies: [],
                dependencyConcentration: 0,
                instability: 0,
                couplingScore: 0
            };

            const hotspotItem = report.hotspots.hotspots.find(h => h.filePath === targetFilePath);
            const fileRisk = report.analysis.risks.find(r => r.filePath === targetFilePath);

            const fileFindings = report.analysis.findings.filter(f => f.filePath === targetFilePath);

            const impact = getAdvancedImpactReport(dependencyGraph, targetFilePath, {
                callGraph
            });

            const explainReport: ExplainReport = {
                filePath: targetFilePath,
                layer: classification.layer,
                confidence: classification.confidence,
                riskScore: hotspotItem?.score ?? fileRisk?.score ?? 0,
                riskLevel: hotspotItem?.riskTier ?? fileRisk?.level ?? "low",
                coupling: {
                    fanIn: couplingMetric.fanIn,
                    fanOut: couplingMetric.fanOut,
                    instability: couplingMetric.instability,
                    couplingScore: couplingMetric.couplingScore
                },
                findings: fileFindings.map(f => ({
                    id: f.id,
                    category: f.category,
                    severity: f.severity,
                    title: f.title,
                    message: f.message,
                    evidence: f.evidence
                })),
                impact: {
                    directDependents: impact.directDependents,
                    totalAffected: impact.totalAffected,
                    depth: impact.impactDepth
                },
                explanation: `Module '${targetFilePath}' operates in the '${classification.layer}' layer with ${couplingMetric.fanIn} incoming and ${couplingMetric.fanOut} outgoing dependencies. Modifying this file impacts ${impact.totalAffected} other file(s) up to depth ${impact.impactDepth}.`,
                recommendations: [
                    ...(fileFindings.map(f => `Resolve finding: ${f.title}`)),
                    ...(couplingMetric.fanOut > 7 ? ["Consider breaking down this module to reduce outgoing dependencies."] : []),
                    ...(hotspotItem && hotspotItem.score > 60 ? ["This module is a high-risk hotspot; write comprehensive tests before refactoring."] : [])
                ]
            };

            if (jsonOutput) {
                console.log(JSON.stringify(explainReport, null, 2));
            } else {
                console.log(formatExplainReport(explainReport));
            }
            return 0;
        }

        default: {
            console.error(`Error: Unknown command '${command}'`);
            if (!jsonOutput) {
                printHelp();
            }
            return 1;
        }
    }
}
