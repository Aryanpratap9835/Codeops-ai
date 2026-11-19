
import { describe, expect, it } from "vitest";

import {
    findStronglyConnectedComponents,
    findCircularDependencyGroups
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

describe("Tarjan SCC Algorithm", () => {
    it("finds a strongly connected component", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "C.ts"],
                ["C.ts", "A.ts"]
            ]
        );

        expect(findStronglyConnectedComponents(graph)).toEqual([
            ["A.ts", "B.ts", "C.ts"]
        ]);
    });

    it("identifies separate strongly connected components", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts", "D.ts", "E.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "A.ts"],
                ["C.ts", "D.ts"],
                ["D.ts", "C.ts"],
                ["E.ts", "D.ts"]
            ]
        );

        expect(findStronglyConnectedComponents(graph)).toEqual([
            ["A.ts", "B.ts"],
            ["C.ts", "D.ts"],
            ["E.ts"]
        ]);
    });

    it("returns individual components for an acyclic graph", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "C.ts"]
            ]
        );

        expect(findStronglyConnectedComponents(graph)).toEqual([
            ["C.ts"],
            ["B.ts"],
            ["A.ts"]
        ]);
    });

    it("handles disconnected nodes", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            []
        );

        expect(findStronglyConnectedComponents(graph)).toEqual([
            ["A.ts"],
            ["B.ts"],
            ["C.ts"]
        ]);
    });

    it("detects self-referencing circular dependency groups", () => {
        const graph = createGraph(
            ["A.ts", "B.ts"],
            [
                ["A.ts", "A.ts"],
                ["B.ts", "A.ts"]
            ]
        );

        expect(findCircularDependencyGroups(graph)).toEqual([
            ["A.ts"]
        ]);
    });

    it("excludes ordinary single-node components from circular groups", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "A.ts"]
            ]
        );

        expect(findCircularDependencyGroups(graph)).toEqual([
            ["A.ts", "B.ts"]
        ]);
    });

    it("handles multiple circular groups and isolated files", () => {
        const graph = createGraph(
            ["A.ts", "B.ts", "C.ts", "D.ts", "E.ts", "F.ts"],
            [
                ["A.ts", "B.ts"],
                ["B.ts", "A.ts"],
                ["C.ts", "D.ts"],
                ["D.ts", "E.ts"],
                ["E.ts", "C.ts"]
            ]
        );

        expect(findCircularDependencyGroups(graph)).toEqual([
            ["A.ts", "B.ts"],
            ["C.ts", "D.ts", "E.ts"]
        ]);
    });
});