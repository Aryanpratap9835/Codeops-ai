
import { describe, expect, it } from "vitest";
import {
    getAffectedFiles,
    getImpactReport
} from "../../src/core/graph/graph-analysis";
import { GraphResult } from "../../src/core/graph/graph-type";

function createGraph(
    files: string[],
    dependencies: [string, string][]
): GraphResult {
    return {
        nodes: files.map((filePath) => ({
            id: filePath,
            kind: "file" as const,
            filePath
        })),
        edges: dependencies.map(([source, target], index) => ({
            id: `${source}->${target}:${index}`,
            source,
            target,
            kind: "imports" as const,
            specifier: `./${target}`,
            isTypeOnly: false
        }))
    };
}

describe("Impact Analysis", () => {
    it("finds all directly and indirectly affected files", () => {
        const graph = createGraph(
            ["database.ts", "user.ts", "auth.ts", "controller.ts"],
            [
                ["user.ts", "database.ts"],
                ["auth.ts", "user.ts"],
                ["controller.ts", "auth.ts"]
            ]
        );

        expect(getAffectedFiles(graph, "database.ts")).toEqual([
            "user.ts",
            "auth.ts",
            "controller.ts"
        ]);
    });

    it("returns an empty array when no files depend on the changed file", () => {
        const graph = createGraph(
            ["database.ts", "logger.ts"],
            []
        );

        expect(getAffectedFiles(graph, "database.ts")).toEqual([]);
    });

    it("generates the correct impact report", () => {
        const graph = createGraph(
            [
                "database.ts",
                "user.ts",
                "auth.ts",
                "admin.ts",
                "controller.ts"
            ],
            [
                ["user.ts", "database.ts"],
                ["auth.ts", "user.ts"],
                ["admin.ts", "database.ts"],
                ["controller.ts", "auth.ts"]
            ]
        );

        expect(getImpactReport(graph, "database.ts")).toEqual({
            changedFile: "database.ts",
            directDependents: ["user.ts", "admin.ts"],
            indirectDependents: ["auth.ts", "controller.ts"],
            allAffectedFiles: [
                "user.ts",
                "admin.ts",
                "auth.ts",
                "controller.ts"
            ],
            totalAffected: 4
        });
    });

    it("handles circular dependencies without duplicate affected files", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "C.ts"],
                ["C.ts", "A.ts"]
            ]
        );

        expect(getAffectedFiles(graph, "A.ts")).toEqual([
            "C.ts",
            "B.ts"
        ]);
    });

    it("does not include the changed file in its own impact report", () => {
        const graph = createGraph(
            ["A.ts", "B.ts"],
            [
                ["B.ts", "A.ts"]
            ]
        );

        const report = getImpactReport(graph, "A.ts");

        expect(report.allAffectedFiles).not.toContain("A.ts");
        expect(report.totalAffected).toBe(1);
    });
});