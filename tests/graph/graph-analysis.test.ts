
import { describe, it, expect } from "vitest";

import {
    detectCycles,
    getDirectDependents,
    getTransitiveDependents
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

describe("Cycle Detection", () => {
    it("returns no cycles for an acyclic graph", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "C.ts"]
            ]
        );

        expect(detectCycles(graph)).toEqual([]);
    });

    it("detects a simple dependency cycle", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "C.ts"],
                ["C.ts", "A.ts"]
            ]
        );

        expect(detectCycles(graph)).toEqual([
            ["A.ts", "B.ts", "C.ts", "A.ts"]
        ]);
    });

    it("detects cycles in disconnected components", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts", "D.ts", "E.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "A.ts"],
                ["C.ts", "D.ts"],
                ["D.ts", "E.ts"],
                ["E.ts", "C.ts"]
            ]
        );

        expect(detectCycles(graph)).toEqual([
            ["A.ts", "B.ts", "A.ts"],
            ["C.ts", "D.ts", "E.ts", "C.ts"]
        ]);
    });

    it("detects a self-referencing dependency", () => {
        const graph = createGraph(
            ["A.ts"],
            [["A.ts", "A.ts"]]
        );

        expect(detectCycles(graph)).toEqual([
            ["A.ts", "A.ts"]
        ]);
    });

    it("detects a cycle without treating its outgoing tail as part of the cycle", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts", "D.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "C.ts"],
                ["C.ts", "A.ts"],
                ["C.ts", "D.ts"]
            ]
        );

        expect(detectCycles(graph)).toEqual([
            ["A.ts", "B.ts", "C.ts", "A.ts"]
        ]);
    });
});

const graph: GraphResult = {
    nodes: [
        "A.ts",
        "B.ts",
        "C.ts",
        "D.ts",
        "E.ts"
    ].map(filePath => ({
        id: filePath,
        kind: "file" as const,
        filePath
    })),

    edges: [
        {
            id: "1",
            source: "A.ts",
            target: "B.ts",
            kind: "imports",
            specifier: "./B",
            isTypeOnly: false
        },
        {
            id: "2",
            source: "B.ts",
            target: "C.ts",
            kind: "imports",
            specifier: "./C",
            isTypeOnly: false
        },
        {
            id: "3",
            source: "D.ts",
            target: "C.ts",
            kind: "imports",
            specifier: "./C",
            isTypeOnly: false
        },
        {
            id: "4",
            source: "E.ts",
            target: "C.ts",
            kind: "imports",
            specifier: "./C",
            isTypeOnly: false
        }
    ]
};

describe("Graph Analysis", () => {
    it("finds direct dependents", () => {
        expect(getDirectDependents(graph, "C.ts"))
            .toEqual(["B.ts", "D.ts", "E.ts"]);
    });

    it("finds transitive dependents", () => {
        const result = getTransitiveDependents(graph, "C.ts");

        expect(result).toContain("A.ts");
        expect(result).toContain("B.ts");
        expect(result).toContain("D.ts");
        expect(result).toContain("E.ts");
    });

    it("does not include the target itself", () => {
        const result = getTransitiveDependents(graph, "C.ts");

        expect(result).not.toContain("C.ts");
    });

    it("returns an empty array for a file with no dependents", () => {
        expect(getDirectDependents(graph, "A.ts")).toEqual([]);
        expect(getTransitiveDependents(graph, "A.ts")).toEqual([]);
    });

    it("handles circular dependencies without infinite loops", () => {
        const cyclicGraph: GraphResult = {
            nodes: [
                { id: "A.ts", kind: "file", filePath: "A.ts" },
                { id: "B.ts", kind: "file", filePath: "B.ts" }
            ],
            edges: [
                {
                    id: "1",
                    source: "A.ts",
                    target: "B.ts",
                    kind: "imports",
                    specifier: "./B",
                    isTypeOnly: false
                },
                {
                    id: "2",
                    source: "B.ts",
                    target: "A.ts",
                    kind: "imports",
                    specifier: "./A",
                    isTypeOnly: false
                }
            ]
        };

        const result = getTransitiveDependents(cyclicGraph, "A.ts");

        expect(result).toEqual(["B.ts"]);
        expect(result).not.toContain("A.ts");
    });
});
