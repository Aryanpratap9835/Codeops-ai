import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import type { GitChangeSummary } from "./workflow-types";

export function getGitChanges(rootPath: string, baseBranch?: string): GitChangeSummary {
    const gitDir = path.join(rootPath, ".git");
    if (!fs.existsSync(gitDir)) {
        return {
            isGitRepo: false,
            currentBranch: null,
            baseBranch: baseBranch ?? null,
            changedFiles: []
        };
    }

    try {
        const isInside = execSync("git rev-parse --is-inside-work-tree", {
            cwd: rootPath,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim();

        if (isInside !== "true") {
            return {
                isGitRepo: false,
                currentBranch: null,
                baseBranch: baseBranch ?? null,
                changedFiles: []
            };
        }

        const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: rootPath,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim();

        const changedFiles: GitChangeSummary["changedFiles"] = [];

        // If baseBranch is specified, diff against that branch
        if (baseBranch) {
            try {
                const diffOutput = execSync(`git diff --name-status ${baseBranch}`, {
                    cwd: rootPath,
                    encoding: "utf-8",
                    stdio: ["ignore", "pipe", "ignore"]
                });

                for (const line of diffOutput.split(/\r?\n/)) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const parts = trimmed.split(/\s+/);
                    const statusCode = parts[0] ?? "";
                    const filePath = parts[1] ?? "";

                    if (filePath) {
                        const status = statusCode.startsWith("A") ? "added" : statusCode.startsWith("D") ? "deleted" : "modified";
                        changedFiles.push({ filePath, status });
                    }
                }
            } catch {
                // fallback to working tree status
            }
        }

        if (changedFiles.length === 0) {
            // Check unstaged and staged changes in working tree
            const statusOutput = execSync("git status --porcelain", {
                cwd: rootPath,
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "ignore"]
            });

            for (const line of statusOutput.split(/\r?\n/)) {
                if (line.length < 3) continue;
                const statusCode = line.slice(0, 2).trim();
                const filePath = line.slice(3).trim();

                const status = statusCode.includes("A") || statusCode === "??" ? "added" : statusCode.includes("D") ? "deleted" : "modified";
                changedFiles.push({ filePath, status });
            }
        }

        return {
            isGitRepo: true,
            currentBranch,
            baseBranch: baseBranch ?? null,
            changedFiles
        };
    } catch {
        return {
            isGitRepo: false,
            currentBranch: null,
            baseBranch: baseBranch ?? null,
            changedFiles: []
        };
    }
}
