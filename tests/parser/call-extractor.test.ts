import { describe, it, expect } from "vitest";
import ts from "typescript";
import { extractAST } from "../../src/core/parser/ast-extractor";

function parse(source: string) {
    const file = ts.createSourceFile("sample.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return extractAST(file, "sample.ts");
}

describe("caller-aware call extraction", () => {
    it("attributes calls to named functions and top-level code", () => {
        const parsed = parse(`function work(){ helper(); } function helper(){} work();`);
        expect(parsed.calls.find(c => c.callee === "helper")?.callerName).toBe("work");
        const topLevel = parsed.calls.find(c => c.callee === "work");
        expect(topLevel?.callerId).toBeNull();
    });

    it("attributes nested functions to the innermost function", () => {
        const parsed = parse(`function outer(){ function inner(){ leaf(); } inner(); } function leaf(){}`);
        expect(parsed.calls.find(c => c.callee === "leaf")?.callerName).toBe("inner");
        expect(parsed.calls.find(c => c.callee === "inner")?.callerName).toBe("outer");
    });

    it("creates symbols for anonymous callbacks", () => {
        const parsed = parse(`function run(){ setTimeout(() => { save(); }, 10); } function save(){}`);
        const callback = parsed.symbols.find(s => s.name.startsWith("<anonymous@"));
        expect(callback).toBeDefined();
        expect(parsed.calls.find(c => c.callee === "save")?.callerId).toBe(callback?.id);
    });

    it("tracks nested arrow functions", () => {
        const parsed = parse(`const outer = () => { const inner = () => { persist(); }; inner(); }; function persist(){}`);
        expect(parsed.calls.find(c => c.callee === "persist")?.callerName).toBe("inner");
        expect(parsed.calls.find(c => c.callee === "inner")?.callerName).toBe("outer");
    });

    it("records callee kind and optional calls", () => {
        const parsed = parse(`function run(){ obj.save?.(); list[0](); helper(); } function helper(){}`);
        expect(parsed.calls.find(c => c.callee === "obj.save")?.calleeKind).toBe("property");
        expect(parsed.calls.find(c => c.callee === "obj.save")?.isOptional).toBe(true);
        expect(parsed.calls.find(c => c.callee === "list[0]")?.calleeKind).toBe("element");
        expect(parsed.calls.find(c => c.callee === "helper")?.calleeKind).toBe("identifier");
    });
});
