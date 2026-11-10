
import * as fs from "fs/promises";
import * as path from "path";
import { shouldIgnore, shouldTake } from "./file-filter";

interface ScanError {
    path: string;
    code: string;
    message: string;
}

interface ScanResult {
    files: string[];
    errors: ScanError[];
}

export async function scanRepository(
    rootPath: string
): Promise<ScanResult> {

    const allFiles: string[] = [];
    const scanErrors: ScanError[] = [];

    let rootStats;

    try {
        rootStats = await fs.stat(rootPath);
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        throw new Error(
            `Invalid repository root: ${rootPath}. ${err.message}`
        );
    }

    if (!rootStats.isDirectory()) {
        throw new Error(`Repository root is not a directory: ${rootPath}`);
    }

    async function scanDirectory(
        currentPath: string
    ): Promise<void> {

        let entries;

        try {
            entries = await fs.readdir(currentPath, {
                withFileTypes: true
            });
        } catch (error) {
            const err = error as NodeJS.ErrnoException;

            scanErrors.push({
                path: currentPath,
                code: err.code ?? "UNKNOWN",
                message: err.message
            });

            return;
        }

        for (const entry of entries) {

            const fullPath = path.join(currentPath, entry.name);
            if (entry.isSymbolicLink()) {
                continue;
            }
            if (entry.isDirectory()) {

                if (shouldIgnore(entry.name)) {
                    continue;
                }

                await scanDirectory(fullPath);
            }

            else if (entry.isFile()) {

                if (shouldTake(entry.name)) {
                    const relativePath = path.relative(rootPath, fullPath)
                        .split(path.sep)
                        .join("/");

                    allFiles.push(relativePath);
                }
            }
        }
    }
    await scanDirectory(rootPath);

    return {
        files: allFiles,
        errors: scanErrors
    };
}