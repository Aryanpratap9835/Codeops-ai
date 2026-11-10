
import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript";

import { extractAST } from "./ast-extractor";
import {
    ParseError,
    ParseResult
} from "./parser-types";

const supportedExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mts",
    ".cts",
    ".mjs",
    ".cjs"
]);

function getScriptKind(filePath: string): ts.ScriptKind {
    const extension = path.extname(filePath).toLowerCase();

    switch (extension) {
        case ".tsx":
            return ts.ScriptKind.TSX;

        case ".jsx":
            return ts.ScriptKind.JSX;

        case ".js":
        case ".mjs":
        case ".cjs":
            return ts.ScriptKind.JS;

        default:
            return ts.ScriptKind.TS;
    }
}

function isInsideRepository(
    rootPath: string,
    filePath: string
): boolean {
    const relative = path.relative(rootPath, filePath);

    return (
        relative !== "" &&
        !relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative)
    );
}

export async function parseRepository(
    rootPath: string,
    filePaths: string[]
): Promise<ParseResult> {
    const absoluteRoot = path.resolve(rootPath);

    const parsedFiles: ParseResult["files"] = [];
    const errors: ParseError[] = [];

    for (const relativePath of filePaths) {
        const extension = path.extname(relativePath).toLowerCase();

        if (!supportedExtensions.has(extension)) {
            errors.push({
                filePath: relativePath,
                code: "UNSUPPORTED_LANGUAGE",
                message: `Cannot parse ${extension || "unknown"} files yet.`
            });

            continue;
        }

        const absolutePath = path.resolve(
            absoluteRoot,
            relativePath
        );

        if (!isInsideRepository(absoluteRoot, absolutePath)) {
            errors.push({
                filePath: relativePath,
                code: "INVALID_FILE_PATH",
                message: "File path points outside the repository."
            });

            continue;
        }

        let sourceCode: string;

        try {
            sourceCode = await fs.readFile(absolutePath, "utf-8");
        } catch (error) {
            const err = error as NodeJS.ErrnoException;

            errors.push({
                filePath: relativePath,
                code: err.code ?? "READ_ERROR",
                message: err.message
            });

            continue;
        }

        const sourceFile = ts.createSourceFile(
            relativePath,
            sourceCode,
            ts.ScriptTarget.Latest,
            true,
            getScriptKind(relativePath)
        );

        const parsedFile = extractAST(
            sourceFile,
            relativePath
        );

        parsedFiles.push(parsedFile);
    }

    return {
        files: parsedFiles,
        errors
    };
}