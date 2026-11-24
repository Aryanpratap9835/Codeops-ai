import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { executeCommand } from "../../src/cli/cli-runner";

describe("Milestone 3 — Developer Experience and CLI", () => {
    let stdoutOutput: string[] = [];
    let stderrOutput: string[] = [];

    const originalLog = console.log;
    const originalError = console.error;

    beforeEach(() => {
        stdoutOutput = [];
        stderrOutput = [];

        console.log = vi.fn((...args: unknown[]) => {
            stdoutOutput.push(args.map(String).join(" "));
        });

        console.error = vi.fn((...args: unknown[]) => {
            stderrOutput.push(args.map(String).join(" "));
        });
    });

    afterEach(() => {
        console.log = originalLog;
        console.error = originalError;
        vi.restoreAllMocks();
    });

    describe("1. Help & command validation", () => {
        it("returns exit code 0 and prints help for help command or empty args", async () => {
            const code1 = await executeCommand([]);
            expect(code1).toBe(0);
            expect(stdoutOutput.join("\n")).toContain("CodeOps CLI");

            stdoutOutput = [];
            const code2 = await executeCommand(["help"]);
            expect(code2).toBe(0);
            expect(stdoutOutput.join("\n")).toContain("Commands:");
        });

        it("returns exit code 1 for unknown commands", async () => {
            const code = await executeCommand(["unknown-command", "./test-repo"]);
            expect(code).toBe(1);
            expect(stderrOutput.join("\n")).toContain("Unknown command");
        });

        it("returns exit code 1 when repository path is missing", async () => {
            const code = await executeCommand(["analyze"]);
            expect(code).toBe(1);
            expect(stderrOutput.join("\n")).toContain("Missing repository path");
        });

        it("returns exit code 1 when repository path does not exist", async () => {
            const code = await executeCommand(["analyze", "./non-existent-folder-12345"]);
            expect(code).toBe(1);
            expect(stderrOutput.join("\n")).toContain("does not exist");
        });
    });

    describe("2. Strict JSON output validation with JSON.parse", () => {
        it("emits strictly valid JSON for analyze --json", async () => {
            const code = await executeCommand(["analyze", "./test-repo", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            expect(() => JSON.parse(output)).not.toThrow();

            const parsed = JSON.parse(output);
            expect(parsed.schemaVersion).toBe("1.0.0");
            expect(parsed.repository).toBeDefined();
            expect(parsed.architecture).toBeDefined();
            expect(parsed.dependencyHealth).toBeDefined();
            expect(parsed.hotspots).toBeDefined();
        });

        it("emits strictly valid JSON for architecture --json", async () => {
            const code = await executeCommand(["architecture", "./test-repo", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.schemaVersion).toBe("1.0.0");
            expect(parsed.architecture).toBeDefined();
        });

        it("emits strictly valid JSON for dependencies --json", async () => {
            const code = await executeCommand(["dependencies", "./test-repo", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.schemaVersion).toBe("1.0.0");
            expect(parsed.graph).toBeDefined();
        });

        it("emits strictly valid JSON for health --json", async () => {
            const code = await executeCommand(["health", "./test-repo", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.schemaVersion).toBe("1.0.0");
            expect(parsed.health.healthScore).toBeDefined();
        });

        it("emits strictly valid JSON for hotspots --json", async () => {
            const code = await executeCommand(["hotspots", "./test-repo", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.schemaVersion).toBe("1.0.0");
            expect(parsed.hotspots.topHotspots).toBeDefined();
        });

        it("emits strictly valid JSON for impact --json", async () => {
            const code = await executeCommand(["impact", "./test-repo", "src/services/user.ts", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.schemaVersion).toBe("1.0.0");
            expect(parsed.impact.directDependents).toBeDefined();
        });

        it("emits strictly valid JSON for explain --json", async () => {
            const code = await executeCommand(["explain", "./test-repo", "src/services/user.ts", "--json"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.filePath).toBeDefined();
            expect(parsed.coupling).toBeDefined();
            expect(parsed.impact).toBeDefined();
        });
    });

    describe("3. Missing required subcommand arguments", () => {
        it("returns exit code 1 when target file is missing for impact command", async () => {
            const code = await executeCommand(["impact", "./test-repo"]);
            expect(code).toBe(1);
            expect(stderrOutput.join("\n")).toContain("Missing target file argument");
        });

        it("returns exit code 1 when target file is missing for explain command", async () => {
            const code = await executeCommand(["explain", "./test-repo"]);
            expect(code).toBe(1);
            expect(stderrOutput.join("\n")).toContain("Missing target file argument");
        });
    });

    describe("4. Human-readable reports formatting", () => {
        it("formats analyze report with overview, health, and hotspots sections", async () => {
            const code = await executeCommand(["analyze", "./test-repo"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            expect(output).toContain("CodeOps Repository Analysis");
            expect(output).toContain("[1] Repository Overview");
            expect(output).toContain("[2] Architecture Summary");
            expect(output).toContain("[3] Dependency Health");
            expect(output).toContain("[4] Call Graph");
            expect(output).toContain("[5] Hotspots & High Risk Files");
        });

        it("formats architecture report with layers and inter-layer dependencies", async () => {
            const code = await executeCommand(["architecture", "./test-repo"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            expect(output).toContain("Architecture Detection Report");
            expect(output).toContain("Detected Layers:");
        });

        it("formats impact report with depth and affected functions", async () => {
            const code = await executeCommand(["impact", "./test-repo", "src/services/user.ts"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            expect(output).toContain("Change Impact Report");
            expect(output).toContain("Target File:       src/services/user.ts");
            expect(output).toContain("Impact Depth:");
            expect(output).toContain("Affected Functions");
        });

        it("formats explain report with module details and recommendations", async () => {
            const code = await executeCommand(["explain", "./test-repo", "src/services/user.ts"]);
            expect(code).toBe(0);

            const output = stdoutOutput.join("\n");
            expect(output).toContain("Module Explanation Report");
            expect(output).toContain("Coupling:");
            expect(output).toContain("Direct Dependents:");
        });
    });
});
