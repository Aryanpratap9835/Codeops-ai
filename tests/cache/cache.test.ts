import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { CacheManager } from "../../src/core/cache/cache-manager";
import { profileRepositoryAnalysis } from "../../src/core/cache/profiler";
import { executeCommand } from "../../src/cli/cli-runner";
import type { GraphResult } from "../../src/core/graph/graph-type";

describe("Milestone 6 — Incremental Analysis and Performance Engine", () => {
    let tempRoot: string;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codeops-cache-test-"));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("saves and loads cache manifests", () => {
        const mgr = new CacheManager(tempRoot);
        expect(mgr.loadManifest()).toBeNull();

        mgr.saveManifest({
            version: "1.0.0",
            codeopsVersion: "1.0.0",
            updatedAt: new Date().toISOString(),
            files: {
                "src/index.ts": {
                    filePath: "src/index.ts",
                    contentHash: "abc123hash",
                    fileSize: 100,
                    mtimeMs: 1000,
                    parsedFile: {
                        filePath: "src/index.ts",
                        functions: [],
                        classes: [],
                        imports: [],
                        exports: [],
                        calls: [],
                        symbols: [],
                        diagnostics: []
                    }
                }
            }
        });

        const loaded = mgr.loadManifest();
        expect(loaded).toBeDefined();
        expect(loaded?.files["src/index.ts"]).toBeDefined();
        expect(loaded?.files["src/index.ts"]?.contentHash).toBe("abc123hash");
    });

    it("handles corrupted cache files gracefully", () => {
        const mgr = new CacheManager(tempRoot);
        const cacheDir = path.join(tempRoot, ".codeops-cache");
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, "manifest.json"), "{ invalid json [ corrupted }");

        expect(mgr.loadManifest()).toBeNull();
    });

    it("computes accurate diff for new, modified, deleted, and unchanged files", () => {
        const file1 = path.join(tempRoot, "file1.ts");
        const file2 = path.join(tempRoot, "file2.ts");
        fs.writeFileSync(file1, "const a = 1;");
        fs.writeFileSync(file2, "const b = 2;");

        const mgr = new CacheManager(tempRoot);
        const entry1 = mgr.createCacheEntry("file1.ts", {
            filePath: "file1.ts",
            functions: [],
            classes: [],
            imports: [],
            exports: [],
            calls: [],
            symbols: [],
            diagnostics: []
        }, "const a = 1;");

        const entry2 = mgr.createCacheEntry("file2.ts", {
            filePath: "file2.ts",
            functions: [],
            classes: [],
            imports: [],
            exports: [],
            calls: [],
            symbols: [],
            diagnostics: []
        }, "const b = 2;");

        const manifest = {
            version: "1.0.0",
            codeopsVersion: "1.0.0",
            updatedAt: new Date().toISOString(),
            files: {
                "file1.ts": entry1,
                "file2.ts": entry2,
                "deleted.ts": entry1
            }
        };

        // Modify file2
        fs.writeFileSync(file2, "const b = 999;");
        // Create new file3
        const file3 = path.join(tempRoot, "file3.ts");
        fs.writeFileSync(file3, "const c = 3;");

        const diff = mgr.computeDiff(["file1.ts", "file2.ts", "file3.ts"], manifest);

        expect(diff.unchangedFiles).toContain("file1.ts");
        expect(diff.modifiedFiles).toContain("file2.ts");
        expect(diff.newFiles).toContain("file3.ts");
        expect(diff.deletedFiles).toContain("deleted.ts");
    });

    it("performs dependency-aware invalidation using graph dependents", () => {
        const mgr = new CacheManager(tempRoot);

        // Dependency chain: a -> b -> c
        const graph: GraphResult = {
            nodes: [
                { id: "a.ts", kind: "file", filePath: "a.ts" },
                { id: "b.ts", kind: "file", filePath: "b.ts" },
                { id: "c.ts", kind: "file", filePath: "c.ts" }
            ],
            edges: [
                { id: "b->a", source: "b.ts", target: "a.ts", kind: "imports", specifier: "./a", isTypeOnly: false },
                { id: "c->b", source: "c.ts", target: "b.ts", kind: "imports", specifier: "./b", isTypeOnly: false }
            ]
        };

        // When a.ts is modified, b.ts and c.ts must be invalidated
        const invalidated = mgr.getInvalidatedDependents(["a.ts"], graph);
        expect(invalidated.has("a.ts")).toBe(true);
        expect(invalidated.has("b.ts")).toBe(true);
        expect(invalidated.has("c.ts")).toBe(true);
    });

    it("clears cache directory completely", () => {
        const mgr = new CacheManager(tempRoot);
        mgr.saveManifest({
            version: "1.0.0",
            codeopsVersion: "1.0.0",
            updatedAt: new Date().toISOString(),
            files: {}
        });

        expect(fs.existsSync(path.join(tempRoot, ".codeops-cache"))).toBe(true);
        expect(mgr.clearCache()).toBe(true);
        expect(fs.existsSync(path.join(tempRoot, ".codeops-cache"))).toBe(false);
    });

    it("profiles repository analysis timings and memory usage", async () => {
        const profile = await profileRepositoryAnalysis("./test-repo");

        expect(profile.fileCount).toBeGreaterThan(0);
        expect(profile.totalTimeMs).toBeGreaterThan(0);
        expect(profile.memoryUsageMb).toBeGreaterThan(0);
        expect(profile.scanTimeMs).toBeGreaterThanOrEqual(0);
        expect(profile.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("executes CLI profile and cache clear commands cleanly", async () => {
        const profileExit = await executeCommand(["profile", "./test-repo", "--json"]);
        expect(profileExit).toBe(0);

        const cacheExit = await executeCommand(["cache", "./test-repo", "clear"]);
        expect(cacheExit).toBe(0);
    });
});
