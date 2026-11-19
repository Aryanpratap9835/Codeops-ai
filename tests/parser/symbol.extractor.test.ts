
import { describe, it, expect } from "vitest";
import ts from "typescript";

import { extractSymbols } from "../../src/core/parser/symbol-extractor";

function parseSource(source: string) {
    const filePath = "test-repo/example.ts";

    const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    return extractSymbols(sourceFile, filePath);
}

describe("Symbol Extractor", () => {

    it("extracts classes, methods and properties", () => {
        const symbols = parseSource(`
            export class UserService {
                id: number = 1;

                getUser() {
                    return this.id;
                }
            }
        `);

        expect(
            symbols.some(
                s => s.name === "UserService" && s.kind === "class"
            )
        ).toBe(true);

        expect(
            symbols.some(
                s => s.name === "id" && s.kind === "property"
            )
        ).toBe(true);

        expect(
            symbols.some(
                s => s.name === "getUser" && s.kind === "method"
            )
        ).toBe(true);
    });

    it("assigns methods and properties to their parent class", () => {
        const symbols = parseSource(`
            class UserService {
                id: number = 1;

                getUser() {}
            }
        `);

        const classSymbol = symbols.find(
            s => s.name === "UserService"
        );

        const method = symbols.find(
            s => s.name === "getUser"
        );

        const property = symbols.find(
            s => s.name === "id"
        );

        expect(classSymbol).toBeDefined();
        expect(method?.parentId).toBe(classSymbol?.id);
        expect(property?.parentId).toBe(classSymbol?.id);
    });

    it("generates unique IDs for duplicate method names", () => {
        const symbols = parseSource(`
            class UserService {
                getUser() {}
            }

            class ProductService {
                getUser() {}
            }
        `);

        const methods = symbols.filter(
            s => s.name === "getUser"
        );

        expect(methods).toHaveLength(2);

        expect(methods[0]?.id).not.toBe(methods[1]?.id);

        expect(methods[0]?.parentId).not.toBe(
            methods[1]?.parentId
        );
    });

    it("detects exported and non-exported symbols", () => {
        const symbols = parseSource(`
            export class UserService {}

            export function createUser() {}

            export const calculate = (a: number, b: number) => a + b;

            function internalFunction() {}
        `);

        expect(
            symbols.find(s => s.name === "UserService")?.exported
        ).toBe(true);

        expect(
            symbols.find(s => s.name === "createUser")?.exported
        ).toBe(true);

        expect(
            symbols.find(s => s.name === "calculate")?.exported
        ).toBe(true);

        expect(
            symbols.find(s => s.name === "internalFunction")?.exported
        ).toBe(false);
    });

    it("maintains parent relationships for nested functions", () => {
        const symbols = parseSource(`
            function outer() {
                function inner() {}
            }
        `);

        const outer = symbols.find(
            s => s.name === "outer"
        );

        const inner = symbols.find(
            s => s.name === "inner"
        );

        expect(inner?.parentId).toBe(outer?.id);
        expect(inner?.qualifiedName).toBe("outer.inner");
    });

    it("records valid source locations", () => {
        const symbols = parseSource(`
            function calculate() {
                return 10;
            }
        `);

        const symbol = symbols.find(
            s => s.name === "calculate"
        );

        expect(symbol).toBeDefined();
        expect(symbol!.location.line).toBeGreaterThan(0);
        expect(symbol!.location.column).toBeGreaterThan(0);
        expect(symbol!.location.start).toBeGreaterThanOrEqual(0);
        expect(symbol!.location.end).toBeGreaterThan(
            symbol!.location.start
        );
    });
});