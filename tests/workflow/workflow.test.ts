import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

import { getGitChanges } from "../../src/core/workflow/git-integration";
import { evaluateQualityGates } from "../../src/core/workflow/quality-gates";
import { exportToSarif } from "../../src/core/workflow/sarif-exporter";
import { executeCommand } from "../../src/cli/cli-runner";

describe("Milestone 7 — Professional Developer Workflow", () => {
    describe("1. Git Integration", () => {
        it("identifies git status and current branch for a git repository", () => {
            const gitInfo = getGitChanges(process.cwd());

            expect(gitInfo.isGitRepo).toBe(true);
            expect(gitInfo.currentBranch).toBeDefined();
            expect(Array.isArray(gitInfo.changedFiles)).toBe(true);
        });

        it("handles non-git directories gracefully", () => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "non-git-"));
            try {
                const gitInfo = getGitChanges(tempDir);
                expect(gitInfo.isGitRepo).toBe(false);
                expect(gitInfo.currentBranch).toBeNull();
                expect(gitInfo.changedFiles.length).toBe(0);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe("2. Quality Gates", () => {
        it("passes quality gate on clean analysis", () => {
            const gateResult = evaluateQualityGates({
                analysis: {
                    metrics: {} as any,
                    semantic: {} as any,
                    deadCodeCandidates: [],
                    risks: [],
                    findings: [],
                    parseErrors: []
                },
                security: {
                    findings: [],
                    summary: {
                        score: 100,
                        grade: "A",
                        totalFindings: 0,
                        severityDistribution: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
                        categoryDistribution: {} as any,
                        confidenceDistribution: {} as any,
                        mostDangerousFiles: [],
                        topCategories: []
                    }
                },
                dependencyHealth: {
                    healthScore: 100,
                    status: "healthy",
                    circularDependencyCount: 0,
                    circularDependencyGroups: [],
                    unresolvedLocalImports: [],
                    highCouplingFiles: [],
                    fragileStructures: [],
                    summary: []
                }
            });

            expect(gateResult.passed).toBe(true);
            expect(gateResult.failures.length).toBe(0);
        });

        it("fails quality gate when critical security findings exceed threshold", () => {
            const gateResult = evaluateQualityGates({
                analysis: { findings: [] } as any,
                security: {
                    findings: [
                        {
                            id: "sec-1",
                            ruleId: "SEC-INJ-SQL",
                            ruleName: "SQLi",
                            severity: "critical",
                            category: "injection",
                            confidence: "high",
                            title: "SQLi",
                            message: "SQLi",
                            filePath: "src/app.ts",
                            location: null,
                            evidence: [],
                            remediation: "param"
                        }
                    ],
                    summary: {
                        score: 75,
                        grade: "C",
                        totalFindings: 1,
                        severityDistribution: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
                        categoryDistribution: {} as any,
                        confidenceDistribution: {} as any,
                        mostDangerousFiles: [],
                        topCategories: []
                    }
                },
                config: {
                    maxCriticalSecurity: 0
                }
            });

            expect(gateResult.passed).toBe(false);
            expect(gateResult.failures.some(f => f.includes("Critical security findings"))).toBe(true);
        });

        it("fails quality gate when circular dependencies exist", () => {
            const gateResult = evaluateQualityGates({
                analysis: { findings: [] } as any,
                dependencyHealth: {
                    circularDependencyCount: 2,
                    unresolvedLocalImports: []
                } as any,
                config: {
                    allowNewCircularDependencies: false
                }
            });

            expect(gateResult.passed).toBe(false);
            expect(gateResult.failures.some(f => f.includes("Circular dependencies detected"))).toBe(true);
        });
    });

    describe("3. SARIF 2.1.0 Export", () => {
        it("exports findings into standard SARIF 2.1.0 log format", () => {
            const sarif = exportToSarif({
                securityFindings: [
                    {
                        id: "sec:1",
                        ruleId: "SEC-SQL-001",
                        ruleName: "SQL Injection",
                        severity: "critical",
                        category: "injection",
                        confidence: "high",
                        title: "SQL Injection",
                        message: "Dynamic SQL query concatenated with user input.",
                        filePath: "src/db/user.ts",
                        location: {
                            line: 42,
                            column: 15,
                            start: 500,
                            end: 550
                        },
                        evidence: ["db.query(...)"],
                        remediation: "Use query parameters.",
                        cwe: "CWE-89"
                    }
                ],
                analysisFindings: [
                    {
                        id: "arch:1",
                        ruleId: "arch-controller-to-repository",
                        category: "dependency",
                        severity: "high",
                        title: "Controller accessing repository directly",
                        message: "Direct layer violation.",
                        filePath: "src/controllers/user.ts",
                        location: {
                            line: 12,
                            column: 1,
                            start: 120,
                            end: 150
                        },
                        evidence: []
                    }
                ]
            });

            expect(sarif.version).toBe("2.1.0");
            expect(sarif.$schema).toContain("sarif-schema-2.1.0.json");
            expect(sarif.runs.length).toBe(1);

            const run = sarif.runs[0]!;
            expect(run.tool.driver.name).toBe("CodeOps");
            expect(run.tool.driver.rules.some(r => r.id === "SEC-SQL-001")).toBe(true);
            expect(run.results.length).toBe(2);

            const sqlResult = run.results.find(r => r.ruleId === "SEC-SQL-001");
            expect(sqlResult?.level).toBe("error");
            expect(sqlResult?.locations[0]?.physicalLocation.region.startLine).toBe(42);
        });
    });

    describe("4. CLI CI Check & SARIF", () => {
        it("runs codeops check on clean test-repo and passes with exit code 0", async () => {
            const code = await executeCommand(["check", "./test-repo", "--json"]);
            expect(code).toBe(0);
        });

        it("runs codeops analyze with --sarif producing valid SARIF output", async () => {
            let sarifOutput = "";
            const origLog = console.log;
            console.log = (msg: unknown) => {
                sarifOutput += String(msg);
            };

            try {
                const code = await executeCommand(["analyze", "./test-repo", "--sarif"]);
                expect(code).toBe(0);
                const parsed = JSON.parse(sarifOutput);
                expect(parsed.version).toBe("2.1.0");
                expect(parsed.runs).toBeDefined();
            } finally {
                console.log = origLog;
            }
        });
    });
});
