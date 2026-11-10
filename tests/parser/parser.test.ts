
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { parseRepository } from "../../src/core/parser/parser";

test("parser extracts functions, classes, imports, exports and calls", async (t) => {
    const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "codeops-parser-")
    );

    t.after(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    const source = `
import { readFile } from "node:fs/promises";

export function add(a: number, b: number): number {
    return a + b;
}

export const multiply = (a: number, b: number) => {
    return a * b;
};

class Calculator {
    value: number = 0;

    subtract(a: number, b: number) {
        return a - b;
    }
}

add(10, 20);
readFile("test.txt");
`;

    await fs.writeFile(
        path.join(root, "example.ts"),
        source
    );

    const result = await parseRepository(
        root,
        ["example.ts"]
    );

    assert.equal(result.errors.length, 0);
    assert.equal(result.files.length, 1);

    const parsed = result.files[0];

    assert.ok(parsed);

    assert.ok(
        parsed.functions.some(
            fn => fn.name === "add" && fn.kind === "function"
        )
    );

    assert.ok(
        parsed.functions.some(
            fn => fn.name === "multiply" && fn.kind === "arrow"
        )
    );

    assert.ok(
        parsed.functions.some(
            fn => fn.name === "subtract" && fn.kind === "method"
        )
    );

    assert.ok(
        parsed.classes.some(
            cls => cls.name === "Calculator"
        )
    );

    assert.ok(
        parsed.imports.some(
            item => item.moduleSpecifier === "node:fs/promises"
        )
    );

    assert.ok(
        parsed.exports.some(
            item => item.name === "add"
        )
    );

    assert.ok(
        parsed.calls.some(
            call => call.callee === "add"
        )
    );

    assert.ok(
        parsed.calls.some(
            call => call.callee === "readFile"
        )
    );

    assert.equal(parsed.diagnostics.length, 0);
});

test("parser reports unsupported file extensions", async () => {
    const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "codeops-parser-")
    );

    try {
        const result = await parseRepository(
            root,
            ["Main.java"]
        );

        assert.equal(result.files.length, 0);
        assert.equal(result.errors.length, 1);
        assert.equal(
            result.errors[0]?.code,
            "UNSUPPORTED_LANGUAGE"
        );
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("parser reports files that cannot be read", async (t) => {
    const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "codeops-parser-")
    );

    t.after(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    const result = await parseRepository(
        root,
        ["missing.ts"]
    );

    assert.equal(result.files.length, 0);
    assert.equal(result.errors.length, 1);
});