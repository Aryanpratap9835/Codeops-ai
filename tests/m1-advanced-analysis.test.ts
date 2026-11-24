import { describe, it, expect } from "vitest";
import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { extractAST } from "../src/core/parser/ast-extractor";
import { buildDependencyGraph } from "../src/core/graph/graph-builder";
import { buildCallGraph } from "../src/core/call-graph/call-graph-builder";
import { createModuleResolver } from "../src/core/graph/module-resolver";
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

describe("Milestone 1 — Advanced Static Analysis", () => {
    describe("1. Dynamic imports", () => {
        it("extracts dynamic import expressions and tags them with isDynamic: true", () => {
            const file = parse("src/loader.ts", `
                export async function loadModule() {
                    const mod = await import("./plugins/worker");
                    return mod;
                }
            `);

            const dynamicImport = file.imports.find(
                imp => imp.moduleSpecifier === "./plugins/worker"
            );

            expect(dynamicImport).toBeDefined();
            expect(dynamicImport?.isDynamic).toBe(true);
            expect(dynamicImport?.isTypeOnly).toBe(false);

            // Dynamic import() should not be captured as a standard unresolved function call
            const callCallees = file.calls.map(c => c.callee);
            expect(callCallees).not.toContain("import");
        });

        it("creates dynamic-imports graph edges in dependency graph", () => {
            const loader = parse("src/loader.ts", `
                export async function load() {
                    return await import("./target");
                }
            `);
            const target = parse("src/target.ts", `
                export const value = 42;
            `);

            const graph = buildDependencyGraph(".", [loader, target]);

            const edge = graph.edges.find(
                e => e.source === "src/loader.ts" && e.target === "src/target.ts"
            );

            expect(edge).toBeDefined();
            expect(edge?.kind).toBe("dynamic-imports");
        });
    });

    describe("2. Namespace imports & namespace function calls", () => {
        it("resolves direct namespace function calls", () => {
            const math = parse("src/math.ts", `
                export function add(a: number, b: number): number {
                    return a + b;
                }
            `);

            const main = parse("src/main.ts", `
                import * as MathUtils from "./math";

                export function run() {
                    return MathUtils.add(2, 3);
                }
            `);

            const graph = buildCallGraph([math, main]);

            const addSymbol = graph.nodes.find(n => n.name === "add");
            const callEdge = graph.edges.find(e => e.callee === "MathUtils.add");

            expect(addSymbol).toBeDefined();
            expect(callEdge).toBeDefined();
            expect(callEdge?.resolution).toBe("resolved");
            expect(callEdge?.target).toBe(addSymbol?.id);
        });

        it("reports helpful reason when member does not exist on imported namespace", () => {
            const math = parse("src/math.ts", `
                export function add(a: number, b: number) { return a + b; }
            `);

            const main = parse("src/main.ts", `
                import * as MathUtils from "./math";

                export function run() {
                    return MathUtils.multiply(2, 3);
                }
            `);

            const graph = buildCallGraph([math, main]);
            const callEdge = graph.edges.find(e => e.callee === "MathUtils.multiply");

            expect(callEdge).toBeDefined();
            expect(callEdge?.resolution).toBe("unresolved");
            expect(callEdge?.reason).toContain("not exported by namespace 'MathUtils'");
        });
    });

    describe("3. Multi-level re-exports", () => {
        it("resolves calls through multi-level re-export chains with renames", () => {
            const core = parse("src/core.ts", `
                export function executeJob() {
                    return "done";
                }
            `);

            const intermediate = parse("src/intermediate.ts", `
                export { executeJob as runJob } from "./core";
            `);

            const facade = parse("src/facade.ts", `
                export { runJob as start } from "./intermediate";
            `);

            const consumer = parse("src/consumer.ts", `
                import { start } from "./facade";

                export function handler() {
                    start();
                }
            `);

            const graph = buildCallGraph([core, intermediate, facade, consumer]);

            const executeJobNode = graph.nodes.find(n => n.name === "executeJob");
            const callEdge = graph.edges.find(e => e.callee === "start");

            expect(executeJobNode).toBeDefined();
            expect(callEdge?.resolution).toBe("resolved");
            expect(callEdge?.target).toBe(executeJobNode?.id);
        });
    });

    describe("4. Default exports and default re-exports", () => {
        it("resolves default function exports", () => {
            const service = parse("src/service.ts", `
                export default function runService() {
                    return true;
                }
            `);

            const app = parse("src/app.ts", `
                import runService from "./service";

                export function main() {
                    runService();
                }
            `);

            const graph = buildCallGraph([service, app]);

            const target = graph.nodes.find(n => n.name === "runService");
            const edge = graph.edges.find(e => e.callee === "runService");

            expect(target).toBeDefined();
            expect(edge?.resolution).toBe("resolved");
            expect(edge?.target).toBe(target?.id);
        });

        it("resolves default re-exports: export { x as default } from './mod'", () => {
            const helper = parse("src/helper.ts", `
                export function helperFn() { return 1; }
            `);

            const index = parse("src/index.ts", `
                export { helperFn as default } from "./helper";
            `);

            const app = parse("src/app.ts", `
                import helper from "./index";

                export function run() {
                    helper();
                }
            `);

            const graph = buildCallGraph([helper, index, app]);

            const target = graph.nodes.find(n => n.name === "helperFn");
            const edge = graph.edges.find(e => e.callee === "helper");

            expect(target).toBeDefined();
            expect(edge?.resolution).toBe("resolved");
            expect(edge?.target).toBe(target?.id);
        });
    });

    describe("5. Export-all behavior", () => {
        it("resolves symbols exported through export * declarations", () => {
            const modA = parse("src/a.ts", `
                export function actionA() { return "A"; }
            `);
            const modB = parse("src/b.ts", `
                export function actionB() { return "B"; }
            `);
            const barrel = parse("src/barrel.ts", `
                export * from "./a";
                export * from "./b";
            `);
            const consumer = parse("src/consumer.ts", `
                import { actionA, actionB } from "./barrel";

                export function run() {
                    actionA();
                    actionB();
                }
            `);

            const graph = buildCallGraph([modA, modB, barrel, consumer]);

            const nodeA = graph.nodes.find(n => n.name === "actionA");
            const nodeB = graph.nodes.find(n => n.name === "actionB");

            const edgeA = graph.edges.find(e => e.callee === "actionA");
            const edgeB = graph.edges.find(e => e.callee === "actionB");

            expect(edgeA?.resolution).toBe("resolved");
            expect(edgeA?.target).toBe(nodeA?.id);

            expect(edgeB?.resolution).toBe("resolved");
            expect(edgeB?.target).toBe(nodeB?.id);
        });

        it("creates re-exports edges in the dependency graph", () => {
            const modA = parse("src/a.ts", `export function actionA() {}`);
            const barrel = parse("src/barrel.ts", `export * from "./a";`);

            const graph = buildDependencyGraph(".", [modA, barrel]);

            const edge = graph.edges.find(
                e => e.source === "src/barrel.ts" && e.target === "src/a.ts"
            );

            expect(edge).toBeDefined();
            expect(edge?.kind).toBe("re-exports");
        });
    });

    describe("6. Circular re-exports", () => {
        it("handles circular re-export chains without infinite recursion", () => {
            const fileA = parse("src/circA.ts", `
                export * from "./circB";
                export function funcA() { return "a"; }
            `);

            const fileB = parse("src/circB.ts", `
                export * from "./circA";
                export function funcB() { return "b"; }
            `);

            const consumer = parse("src/consumer.ts", `
                import { funcA, funcB, missing } from "./circA";

                export function test() {
                    funcA();
                    funcB();
                    missing();
                }
            `);

            // Must terminate without stack overflow
            const graph = buildCallGraph([fileA, fileB, consumer]);

            const nodeA = graph.nodes.find(n => n.name === "funcA");
            const nodeB = graph.nodes.find(n => n.name === "funcB");

            const edgeA = graph.edges.find(e => e.callee === "funcA");
            const edgeB = graph.edges.find(e => e.callee === "funcB");
            const edgeMissing = graph.edges.find(e => e.callee === "missing");

            expect(edgeA?.resolution).toBe("resolved");
            expect(edgeA?.target).toBe(nodeA?.id);

            expect(edgeB?.resolution).toBe("resolved");
            expect(edgeB?.target).toBe(nodeB?.id);

            expect(edgeMissing?.resolution).toBe("unresolved");
        });
    });

    describe("7. Type-only imports and exports", () => {
        it("detects type-only imports and type-only exports", () => {
            const types = parse("src/types.ts", `
                export type ID = string;
                export interface User {
                    id: ID;
                    name: string;
                }
                export function createId(): ID { return "1"; }
            `);

            const consumer = parse("src/consumer.ts", `
                import type { User, ID } from "./types";
                import { createId } from "./types";

                export function run() {
                    createId();
                }
            `);

            const typeImport = consumer.imports.find(
                imp => imp.isTypeOnly
            );
            expect(typeImport).toBeDefined();
            expect(typeImport?.namedImports).toContain("User");

            const idExport = types.exports.find(e => e.name === "ID");
            const userExport = types.exports.find(e => e.name === "User");
            const createIdExport = types.exports.find(e => e.name === "createId");

            expect(idExport?.isTypeOnly).toBe(true);
            expect(userExport?.isTypeOnly).toBe(true);
            expect(createIdExport?.isTypeOnly).toBe(false);

            const depGraph = buildDependencyGraph(".", [types, consumer]);
            const typeOnlyEdge = depGraph.edges.find(
                e => e.source === "src/consumer.ts" && e.isTypeOnly
            );
            expect(typeOnlyEdge).toBeDefined();
        });
    });

    describe("8. Aliased imports", () => {
        it("resolves imported function calls using local aliases", () => {
            const provider = parse("src/provider.ts", `
                export function computeHash(data: string) {
                    return data;
                }
            `);

            const consumer = parse("src/consumer.ts", `
                import { computeHash as hash } from "./provider";

                export function process(str: string) {
                    return hash(str);
                }
            `);

            const graph = buildCallGraph([provider, consumer]);

            const target = graph.nodes.find(n => n.name === "computeHash");
            const edge = graph.edges.find(e => e.callee === "hash");

            expect(target).toBeDefined();
            expect(edge?.resolution).toBe("resolved");
            expect(edge?.target).toBe(target?.id);
        });
    });

    describe("9. TypeScript path aliases", () => {
        it("resolves tsconfig paths in call graph resolution", () => {
            const tempRoot = fs.mkdtempSync(
                path.join(os.tmpdir(), "codeops-m1-alias-")
            );

            try {
                fs.writeFileSync(
                    path.join(tempRoot, "tsconfig.json"),
                    JSON.stringify({
                        compilerOptions: {
                            baseUrl: ".",
                            paths: {
                                "@services/*": ["src/services/*"]
                            }
                        }
                    })
                );

                const service = parse("src/services/auth.ts", `
                    export function authenticate() { return true; }
                `);

                const controller = parse("src/controller.ts", `
                    import { authenticate } from "@services/auth";

                    export function login() {
                        authenticate();
                    }
                `);

                const graph = buildCallGraph(
                    [service, controller],
                    tempRoot
                );

                const authNode = graph.nodes.find(n => n.name === "authenticate");
                const edge = graph.edges.find(e => e.callee === "authenticate");

                expect(authNode).toBeDefined();
                expect(edge?.resolution).toBe("resolved");
                expect(edge?.target).toBe(authNode?.id);
            } finally {
                fs.rmSync(tempRoot, { recursive: true, force: true });
            }
        });
    });

    describe("10. Realistic test repository verification", () => {
        it("resolves barrel re-exports and namespace calls in test-repo", () => {
            const app = parse("test-repo/src/app.ts", `
                import { fetchUser } from "./index";
                import * as users from "./services";

                function main() {
                    fetchUser();
                    users.getUser();
                }

                main();
            `);

            const index = parse("test-repo/src/index.ts", `
                export { fetchUser } from "./services";
            `);

            const servicesIndex = parse("test-repo/src/services/index.ts", `
                export { getUser as fetchUser } from "./user";
                export * from "./user";
            `);

            const user = parse("test-repo/src/services/user.ts", `
                export function getUser() {
                    return "Aryan";
                }
                export function deleteUser() {
                    return "deleted";
                }
            `);

            const graph = buildCallGraph([app, index, servicesIndex, user]);

            const getUserNode = graph.nodes.find(n => n.name === "getUser");
            expect(getUserNode).toBeDefined();

            const fetchUserEdge = graph.edges.find(e => e.callee === "fetchUser");
            expect(fetchUserEdge?.resolution).toBe("resolved");
            expect(fetchUserEdge?.target).toBe(getUserNode?.id);

            const namespaceEdge = graph.edges.find(e => e.callee === "users.getUser");
            expect(namespaceEdge?.resolution).toBe("resolved");
            expect(namespaceEdge?.target).toBe(getUserNode?.id);
        });
    });
});
