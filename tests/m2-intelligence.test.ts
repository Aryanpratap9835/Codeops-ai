import { describe, it, expect } from "vitest";
import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { extractAST } from "../src/core/parser/ast-extractor";
import { buildDependencyGraph } from "../src/core/graph/graph-builder";
import { buildCallGraph } from "../src/core/call-graph/call-graph-builder";
import { getAdvancedImpactReport } from "../src/core/graph/graph-analysis";
import { detectArchitecture, classifyFile } from "../src/core/architecture/architecture-detector";
import { analyzeModuleCoupling } from "../src/core/coupling/coupling-analyzer";
import { analyzeDependencyHealth } from "../src/core/health/dependency-health";
import { detectHotspots } from "../src/core/analyzer/hotspot-analyzer";
import {
    ArchitectureViolationRule,
    DEFAULT_ARCHITECTURE_CONSTRAINTS
} from "../src/core/rules/architecture-violation.rule";
import { analyzeRepository } from "../src/core/rules/analysis-engine";
import type { ParsedFile } from "../src/core/parser/parser-types";

function parse(filePath: string, source: string): ParsedFile {
    const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    return extractAST(sourceFile, filePath);
}

describe("Milestone 2 — Repository Intelligence Engine", () => {
    describe("1. Architecture detection", () => {
        it("classifies files into architectural layers with confidence and evidence", () => {
            const controller = classifyFile("src/controllers/user.controller.ts");
            expect(controller.layer).toBe("controllers");
            expect(controller.confidence).toBe("high");
            expect(controller.evidence.length).toBeGreaterThanOrEqual(2);

            const service = classifyFile("src/services/user.service.ts");
            expect(service.layer).toBe("services");
            expect(service.confidence).toBe("high");

            const repo = classifyFile("src/repositories/user.repository.ts");
            expect(repo.layer).toBe("repositories");
            expect(repo.confidence).toBe("high");

            const model = classifyFile("src/models/user.model.ts");
            expect(model.layer).toBe("models");
            expect(model.confidence).toBe("high");

            const testFile = classifyFile("tests/unit/user.test.ts");
            expect(testFile.layer).toBe("tests");
            expect(testFile.confidence).toBe("high");

            const util = classifyFile("src/utils/string.helper.ts");
            expect(util.layer).toBe("utilities");

            const unknown = classifyFile("src/random/misc.ts");
            expect(unknown.layer).toBe("unclassified");
            expect(unknown.confidence).toBe("low");
        });

        it("generates an architecture report with layer summaries and inter-layer dependencies", () => {
            const controller = parse("src/controllers/user.controller.ts", `
                import { UserService } from "../services/user.service";
                export class UserController {}
            `);
            const service = parse("src/services/user.service.ts", `
                import { UserRepository } from "../repositories/user.repository";
                export class UserService {}
            `);
            const repo = parse("src/repositories/user.repository.ts", `
                export class UserRepository {}
            `);

            const graph = buildDependencyGraph(".", [controller, service, repo]);
            const report = detectArchitecture(
                [controller.filePath, service.filePath, repo.filePath],
                graph
            );

            expect(report.layers.some(l => l.layer === "controllers")).toBe(true);
            expect(report.layers.some(l => l.layer === "services")).toBe(true);
            expect(report.layers.some(l => l.layer === "repositories")).toBe(true);

            const ctrlToSvc = report.layerDependencies.find(
                d => d.sourceLayer === "controllers" && d.targetLayer === "services"
            );
            expect(ctrlToSvc).toBeDefined();
            expect(ctrlToSvc?.edgeCount).toBe(1);

            const svcToRepo = report.layerDependencies.find(
                d => d.sourceLayer === "services" && d.targetLayer === "repositories"
            );
            expect(svcToRepo).toBeDefined();
            expect(svcToRepo?.edgeCount).toBe(1);
        });
    });

    describe("2. Module coupling analysis", () => {
        it("computes fan-in, fan-out, instability, and coupling scores accurately", () => {
            const core = parse("src/core.ts", `export function base() {}`);
            const modA = parse("src/a.ts", `import { base } from "./core"; export function a() { base(); }`);
            const modB = parse("src/b.ts", `import { base } from "./core"; export function b() { base(); }`);
            const modC = parse("src/c.ts", `import { a } from "./a"; import { b } from "./b";`);

            const graph = buildDependencyGraph(".", [core, modA, modB, modC]);
            const report = analyzeModuleCoupling(graph);

            const coreMetrics = report.modules.find(m => m.filePath === "src/core.ts");
            expect(coreMetrics?.fanIn).toBe(2); // imported by a.ts and b.ts
            expect(coreMetrics?.fanOut).toBe(0);
            expect(coreMetrics?.instability).toBe(0); // completely stable

            const cMetrics = report.modules.find(m => m.filePath === "src/c.ts");
            expect(cMetrics?.fanIn).toBe(0);
            expect(cMetrics?.fanOut).toBe(2);
            expect(cMetrics?.instability).toBe(1); // completely unstable
        });

        it("identifies central modules and hub modules with suspicious patterns", () => {
            const hub = parse("src/hub.ts", `
                import { d1 } from "./dep1";
                import { d2 } from "./dep2";
                import { d3 } from "./dep3";
                import { d4 } from "./dep4";
                export function handle() {}
            `);
            const dep1 = parse("src/dep1.ts", `export const d1 = 1;`);
            const dep2 = parse("src/dep2.ts", `export const d2 = 2;`);
            const dep3 = parse("src/dep3.ts", `export const d3 = 3;`);
            const dep4 = parse("src/dep4.ts", `export const d4 = 4;`);

            const client1 = parse("src/c1.ts", `import { handle } from "./hub";`);
            const client2 = parse("src/c2.ts", `import { handle } from "./hub";`);
            const client3 = parse("src/c3.ts", `import { handle } from "./hub";`);
            const client4 = parse("src/c4.ts", `import { handle } from "./hub";`);

            const graph = buildDependencyGraph(".", [
                hub, dep1, dep2, dep3, dep4, client1, client2, client3, client4
            ]);

            const report = analyzeModuleCoupling(graph);
            const hubMetric = report.modules.find(m => m.filePath === "src/hub.ts");

            expect(hubMetric?.fanIn).toBe(4);
            expect(hubMetric?.fanOut).toBe(4);

            const hubPattern = report.suspiciousPatterns.find(
                p => p.filePath === "src/hub.ts" && p.patternType === "hub-module"
            );
            expect(hubPattern).toBeDefined();
        });
    });

    describe("3. Dependency health analysis", () => {
        it("detects unresolved local imports without false positives for external packages", () => {
            const file = parse("src/service.ts", `
                import { readFile } from "node:fs/promises";
                import express from "express";
                import { existing } from "./existing";
                import { missingHelper } from "./missing-helper";

                export function run() {}
            `);
            const existing = parse("src/existing.ts", `export const existing = 1;`);

            const graph = buildDependencyGraph(".", [file, existing]);
            const health = analyzeDependencyHealth(".", [file, existing], graph);

            // Should flag ./missing-helper as unresolved local import
            expect(health.unresolvedLocalImports.length).toBe(1);
            expect(health.unresolvedLocalImports[0]?.specifier).toBe("./missing-helper");

            // Must NOT flag node:fs/promises or express as unresolved local imports
            const specifiers = health.unresolvedLocalImports.map(u => u.specifier);
            expect(specifiers).not.toContain("express");
            expect(specifiers).not.toContain("node:fs/promises");
        });

        it("detects circular dependencies and calculates health score", () => {
            const fileA = parse("src/cycleA.ts", `import { b } from "./cycleB"; export const a = 1;`);
            const fileB = parse("src/cycleB.ts", `import { a } from "./cycleA"; export const b = 2;`);

            const graph = buildDependencyGraph(".", [fileA, fileB]);
            const health = analyzeDependencyHealth(".", [fileA, fileB], graph);

            expect(health.circularDependencyCount).toBe(1);
            expect(health.circularDependencyGroups.length).toBe(1);
            expect(health.healthScore).toBeLessThan(100);
            expect(health.status).not.toBe("healthy");
        });
    });

    describe("4. Change impact analysis", () => {
        it("computes direct dependents, transitive dependents, depth, and explanations", () => {
            const db = parse("src/db.ts", `export function query() {}`);
            const repo = parse("src/repo.ts", `import { query } from "./db"; export function find() { query(); }`);
            const service = parse("src/service.ts", `import { find } from "./repo"; export function get() { find(); }`);
            const controller = parse("src/controller.ts", `import { get } from "./service"; export function handle() { get(); }`);

            const files = [db, repo, service, controller];
            const graph = buildDependencyGraph(".", files);
            const callGraph = buildCallGraph(files);

            const report = getAdvancedImpactReport(graph, "src/db.ts", {
                callGraph
            });

            expect(report.changedFile).toBe("src/db.ts");
            expect(report.directDependents).toEqual(["src/repo.ts"]);
            expect(report.indirectDependents).toContain("src/service.ts");
            expect(report.indirectDependents).toContain("src/controller.ts");
            expect(report.impactDepth).toBe(3);

            // Verify affected functions
            expect(report.affectedFunctions.some(f => f.name === "find")).toBe(true);

            // Verify explanations
            const directExpl = report.explanations.find(e => e.filePath === "src/repo.ts");
            expect(directExpl?.relation).toBe("direct-dependent");
            expect(directExpl?.depth).toBe(1);

            const ctrlExpl = report.explanations.find(e => e.filePath === "src/controller.ts");
            expect(ctrlExpl?.relation).toBe("transitive-dependent");
            expect(ctrlExpl?.depth).toBe(3);
        });
    });

    describe("5. Architecture violation detection", () => {
        it("detects controller directly importing repository", () => {
            const controller = parse("src/controllers/user.controller.ts", `
                import { UserRepository } from "../repositories/user.repository";
                export class UserController {
                    repo = new UserRepository();
                }
            `);
            const repo = parse("src/repositories/user.repository.ts", `
                export class UserRepository {}
            `);

            const graph = buildDependencyGraph(".", [controller, repo]);
            const rule = new ArchitectureViolationRule();

            const findings = rule.evaluate({
                files: [controller, repo],
                dependencyGraph: graph,
                callGraph: { nodes: [], edges: [] },
                semantic: { references: [], unresolvedCallCount: 0, ambiguousCallCount: 0, resolvedCallCount: 0 },
                deadCodeCandidates: [],
                risks: []
            });

            expect(findings.length).toBe(1);
            expect(findings[0]?.severity).toBe("high");
            expect(findings[0]?.title).toContain("Controller directly accesses repository");
        });

        it("detects production code importing test code", () => {
            const service = parse("src/services/auth.service.ts", `
                import { mockUser } from "../../tests/fixtures/mock-user.test";
                export class AuthService {
                    u = mockUser;
                }
            `);
            const testFixture = parse("tests/fixtures/mock-user.test.ts", `
                export const mockUser = { id: 1 };
            `);

            const graph = buildDependencyGraph(".", [service, testFixture]);
            const rule = new ArchitectureViolationRule();

            const findings = rule.evaluate({
                files: [service, testFixture],
                dependencyGraph: graph,
                callGraph: { nodes: [], edges: [] },
                semantic: { references: [], unresolvedCallCount: 0, ambiguousCallCount: 0, resolvedCallCount: 0 },
                deadCodeCandidates: [],
                risks: []
            });

            expect(findings.length).toBe(1);
            expect(findings[0]?.severity).toBe("critical");
            expect(findings[0]?.title).toContain("Application code depends on test code");
        });

        it("allows disabling or reconfiguring architecture constraints", () => {
            const controller = parse("src/controllers/user.controller.ts", `
                import { UserRepository } from "../repositories/user.repository";
                export class UserController {}
            `);
            const repo = parse("src/repositories/user.repository.ts", `
                export class UserRepository {}
            `);

            const graph = buildDependencyGraph(".", [controller, repo]);
            const rule = new ArchitectureViolationRule(
                DEFAULT_ARCHITECTURE_CONSTRAINTS.map(c =>
                    c.id === "arch-controller-to-repository" ? { ...c, enabled: false } : c
                )
            );

            const findings = rule.evaluate({
                files: [controller, repo],
                dependencyGraph: graph,
                callGraph: { nodes: [], edges: [] },
                semantic: { references: [], unresolvedCallCount: 0, ambiguousCallCount: 0, resolvedCallCount: 0 },
                deadCodeCandidates: [],
                risks: []
            });

            expect(findings.length).toBe(0);
        });
    });

    describe("6. Hotspot detection", () => {
        it("generates transparent hotspot score with contributing factor breakdown", () => {
            const complexFile = parse("src/services/complex.service.ts", `
                import { a } from "./a";
                import { b } from "./b";
                import { c } from "./c";

                export function f1() { unknownFn(); }
                export function f2() {}
                export function f3() {}
            `);
            const a = parse("src/services/a.ts", `export const a = 1;`);
            const b = parse("src/services/b.ts", `export const b = 2;`);
            const c = parse("src/services/c.ts", `export const c = 3;`);

            const graph = buildDependencyGraph(".", [complexFile, a, b, c]);
            const callGraph = buildCallGraph([complexFile, a, b, c]);

            const report = detectHotspots([complexFile, a, b, c], graph, callGraph);

            const hotspot = report.hotspots.find(h => h.filePath === "src/services/complex.service.ts");
            expect(hotspot).toBeDefined();
            expect(hotspot?.factors.length).toBeGreaterThanOrEqual(4);

            const couplingFactor = hotspot?.factors.find(f => f.name === "Coupling");
            expect(couplingFactor).toBeDefined();
            expect(couplingFactor?.score).toBeGreaterThan(0);

            const callFactor = hotspot?.factors.find(f => f.name === "Unresolved Calls");
            expect(callFactor).toBeDefined();
            expect(callFactor?.score).toBeGreaterThan(0);
        });
    });

    describe("7. Full repository analysis integration", () => {
        it("populates architecture, coupling, dependencyHealth, and hotspots in analyzeRepository", () => {
            const controller = parse("src/controllers/user.controller.ts", `
                import { UserService } from "../services/user.service";
                export class UserController {
                    run() { new UserService().get(); }
                }
            `);
            const service = parse("src/services/user.service.ts", `
                export class UserService {
                    get() { return 1; }
                }
            `);

            const files = [controller, service];
            const dependencyGraph = buildDependencyGraph(".", files);
            const callGraph = buildCallGraph(files);

            const analysis = analyzeRepository({
                files,
                dependencyGraph,
                callGraph
            });

            expect(analysis.architecture).toBeDefined();
            expect(analysis.architecture?.layers.length).toBe(2);
            expect(analysis.coupling).toBeDefined();
            expect(analysis.coupling?.modules.length).toBe(2);
            expect(analysis.dependencyHealth).toBeDefined();
            expect(analysis.dependencyHealth?.status).toBe("healthy");
            expect(analysis.hotspots).toBeDefined();
            expect(analysis.hotspots?.hotspots.length).toBe(2);
        });
    });
});
