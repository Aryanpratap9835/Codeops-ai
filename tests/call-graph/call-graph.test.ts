
import { describe, it, expect } from "vitest";
import ts from "typescript";

import { extractAST } from "../../src/core/parser/ast-extractor";
import { buildCallGraph } from "../../src/core/call-graph/call-graph-builder";

import {
    getDirectCallees,
    getTransitiveCallees,
    getDirectCallers,
    getTransitiveCallers,
    getReachableFunctions,
    findRecursiveFunctions
} from "../../src/core/call-graph/call-graph-analysis";

import type { ParsedFile } from "../../src/core/parser/parser-types";

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

describe("Function-level call graph", () => {
    it("builds same-file edges and supports graph analysis", () => {
        const file = parse("main.ts", `
            export function main(){ first(); }
            function first(){ second(); }
            function second(){}
        `);

        const graph = buildCallGraph([file]);

        const main = graph.nodes.find(n => n.name === "main")!;
        const first = graph.nodes.find(n => n.name === "first")!;
        const second = graph.nodes.find(n => n.name === "second")!;

        expect(getDirectCallees(graph, main.id)).toContain(first.id);
        expect(getTransitiveCallees(graph, main.id)).toContain(second.id);
        expect(getDirectCallers(graph, second.id)).toContain(first.id);
        expect(getTransitiveCallers(graph, second.id)).toContain(main.id);

        expect(getReachableFunctions(graph, [main.id])).toEqual(
            expect.arrayContaining([first.id, second.id])
        );
    });

    it("resolves relative named imports and aliases", () => {
        const service = parse(
            "src/service.ts",
            `export function getUser() {}`
        );

        const controller = parse("src/controller.ts", `
            import { getUser as fetchUser } from "./service";
            export function handler(){ fetchUser(); }
        `);

        const graph = buildCallGraph([service, controller]);

        const edge = graph.edges.find(e => e.callee === "fetchUser");
        const target = graph.nodes.find(n => n.name === "getUser");

        expect(edge?.resolution).toBe("resolved");
        expect(edge?.target).toBe(target?.id);
    });

    it("resolves this.method within the same class", () => {
        const file = parse("class.ts", `
            class Worker {
                run(){ this.execute(); }
                execute(){}
            }
        `);

        const graph = buildCallGraph([file]);

        const edge = graph.edges.find(e => e.callee === "this.execute");
        const execute = graph.nodes.find(n => n.name === "execute");

        expect(edge?.resolution).toBe("resolved");
        expect(edge?.target).toBe(execute?.id);
    });

    it("classifies known runtime globals as external", () => {
        const file = parse("external.ts", `
            function run(){ console.log("x"); }
            processTask();
        `);

        const graph = buildCallGraph([file]);

        expect(
            graph.edges.find(e => e.callee === "console.log")?.resolution
        ).toBe("external");

        expect(
            graph.edges.find(e => e.callee === "processTask")?.resolution
        ).toBe("unresolved");

        expect(
            graph.edges.find(e => e.callee === "processTask")?.source
        ).toBeNull();
    });

    it("classifies calls through external namespace imports", () => {
        const file = parse("external-imports.ts", `
            import * as fs from "node:fs";
            import path from "node:path";

            function run() {
                fs.mkdirSync("temp");
                path.join("src", "index.ts");
            }
        `);

        const graph = buildCallGraph([file]);

        expect(
            graph.edges.find(e => e.callee === "fs.mkdirSync")?.resolution
        ).toBe("external");

        expect(
            graph.edges.find(e => e.callee === "path.join")?.resolution
        ).toBe("external");
    });

    it("classifies named external package imports as external", () => {
        const file = parse("test-imports.ts", `
            import { describe, expect, test } from "vitest";

            describe("example", () => {
                test("works", () => {
                    expect(true).toBe(true);
                });
            });
        `);

        const graph = buildCallGraph([file]);

        for (const callee of ["describe", "test", "expect"]) {
            expect(
                graph.edges.find(e => e.callee === callee)?.resolution
            ).toBe("external");
        }

        expect(
            graph.edges.find(e => e.callee === "expect(true).toBe")?.resolution
        ).toBe("external");
    });

    it("classifies common built-in methods as external heuristically", () => {
        const file = parse("builtins.ts", `
            function run(items: number[]) {
                items.filter(item => item > 0);
                items.map(item => item * 2);
                items.find(item => item === 1);
            }
        `);

        const graph = buildCallGraph([file]);

        for (const callee of [
            "items.filter",
            "items.map",
            "items.find"
        ]) {
            expect(
                graph.edges.find(e => e.callee === callee)?.resolution
            ).toBe("external");
        }
    });

    it("keeps unknown property calls unresolved", () => {
        const file = parse("unknown-property.ts", `
            function run(client: any) {
                client.performOperation();
            }
        `);

        const graph = buildCallGraph([file]);

        expect(
            graph.edges.find(
                e => e.callee === "client.performOperation"
            )?.resolution
        ).toBe("unresolved");
    });

    it("detects direct and indirect recursion", () => {
        const file = parse("recursive.ts", `
            function a(){ b(); }
            function b(){ a(); }
            function c(){ c(); }
        `);

        const graph = buildCallGraph([file]);

        const a = graph.nodes.find(n => n.name === "a")!;
        const b = graph.nodes.find(n => n.name === "b")!;
        const c = graph.nodes.find(n => n.name === "c")!;

        expect(findRecursiveFunctions(graph)).toEqual(
            expect.arrayContaining([a.id, b.id, c.id])
        );
    });
});