
import { describe, it, expect } from "vitest";

import { buildDependencyGraph } from "../../src/core/graph/graph-builder";
import { ParsedFile } from "../../src/core/parser/parser-types";

const root = "D:/test-repo";

function createParsedFile(
    filePath: string,
    imports: ParsedFile["imports"] = []
): ParsedFile {
    return {
        filePath,
        functions: [],
        classes: [],
        imports,
        exports: [],
        calls: [],
        diagnostics: [],
        symbols: []
    };
}

describe("Graph Builder", () => {
    it("creates a node for every parsed file", () => {
        const files = [
            createParsedFile("src/a.ts"),
            createParsedFile("src/b.ts"),
            createParsedFile("src/c.ts")
        ];

        const graph = buildDependencyGraph(root, files);

        expect(graph.nodes).toHaveLength(3);
        expect(graph.edges).toHaveLength(0);
    });

    it("creates an edge for a resolved import", () => {
        const files = [
            createParsedFile("src/user.service.ts", [
                {
                    moduleSpecifier: "./user.repository",
                    defaultImport: null,
                    namespaceImport: null,
                    namedImports: ["UserRepository"],
                    isTypeOnly: false,
                    location: {
                        line: 1,
                        column: 1,
                        start: 0,
                        end: 50
                    }
                }
            ]),
            createParsedFile("src/user.repository.ts")
        ];

        const graph = buildDependencyGraph(root, files);

        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0].source).toBe("src/user.service.ts");
        expect(graph.edges[0].target).toBe("src/user.repository.ts");
    });

    it("does not create an edge for unresolved imports", () => {
        const files = [
            createParsedFile("src/a.ts", [
                {
                    moduleSpecifier: "./missing",
                    defaultImport: null,
                    namespaceImport: null,
                    namedImports: [],
                    isTypeOnly: false,
                    location: {
                        line: 1,
                        column: 1,
                        start: 0,
                        end: 25
                    }
                }
            ])
        ];

        const graph = buildDependencyGraph(root, files);

        expect(graph.nodes).toHaveLength(1);
        expect(graph.edges).toHaveLength(0);
    });

    it("preserves type-only import information", () => {
        const files = [
            createParsedFile("src/a.ts", [
                {
                    moduleSpecifier: "./b",
                    defaultImport: null,
                    namespaceImport: null,
                    namedImports: ["B"],
                    isTypeOnly: true,
                    location: {
                        line: 1,
                        column: 1,
                        start: 0,
                        end: 30
                    }
                }
            ]),
            createParsedFile("src/b.ts")
        ];

        const graph = buildDependencyGraph(root, files);

        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0].isTypeOnly).toBe(true);
    });

    it("creates multiple edges for multiple imports", () => {
        const files = [
            createParsedFile("src/a.ts", [
                {
                    moduleSpecifier: "./b",
                    defaultImport: null,
                    namespaceImport: null,
                    namedImports: [],
                    isTypeOnly: false,
                    location: {
                        line: 1,
                        column: 1,
                        start: 0,
                        end: 20
                    }
                },
                {
                    moduleSpecifier: "./c",
                    defaultImport: null,
                    namespaceImport: null,
                    namedImports: [],
                    isTypeOnly: false,
                    location: {
                        line: 2,
                        column: 1,
                        start: 21,
                        end: 40
                    }
                }
            ]),
            createParsedFile("src/b.ts"),
            createParsedFile("src/c.ts")
        ];

        const graph = buildDependencyGraph(root, files);

        expect(graph.nodes).toHaveLength(3);
        expect(graph.edges).toHaveLength(2);
    });
});