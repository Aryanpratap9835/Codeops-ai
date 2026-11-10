
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { scanRepository } from "../../src/core/repository/scanner";

// TEST 1: Normal scanning and ignored directories
test("scanner handles temporary repository and ignores unwanted directories", async (t) => {

    const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "codeops-test-")
    );

    t.after(async () => {
        await fs.rm(tempDir, {
            recursive: true,
            force: true
        });
    });

    const directories = [
        "src",
        "src/auth/services",
        "node_modules",
        "dist",
        "coverage",
        ".git"
    ];

    for (const directory of directories) {
        await fs.mkdir(path.join(tempDir, directory), {
            recursive: true
        });
    }

    const files = [
        ["src/index.ts", "console.log('Hello CodeOps');"],
        ["src/auth/services/login.ts", "export function login() {}"],
        ["node_modules/library.js", "module.exports = {};"],
        ["dist/build.js", "console.log('build');"],
        ["coverage/report.js", "console.log('coverage');"],
        [".git/config.js", "console.log('git');"],
        ["README.md", "# CodeOps"]
    ];

    for (const [filePath, content] of files) {
        await fs.writeFile(path.join(tempDir, filePath), content);
    }

    const result = await scanRepository(tempDir);

    const expected = [
        "src/auth/services/login.ts",
        "src/index.ts"
    ];

    assert.deepStrictEqual([...result.files].sort(), expected);
    assert.deepStrictEqual(result.errors, []);
});


// TEST 2: Missing repository
test("scanner should reject a missing repository", async () => {

    const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "codeops-missing-")
    );

    await fs.rm(tempDir, {
        recursive: true,
        force: true
    });

    await assert.rejects(
        scanRepository(tempDir)
    );
});


// TEST 3: File passed instead of directory
test("scanner should reject a file as repository root", async () => {

    const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "codeops-file-")
    );

    try {
        const filePath = path.join(tempDir, "index.ts");

        await fs.writeFile(filePath, "console.log('test');");

        await assert.rejects(
            scanRepository(filePath)
        );
    } finally {
        await fs.rm(tempDir, {
            recursive: true,
            force: true
        });
    }
});