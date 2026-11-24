import * as crypto from "node:crypto";
import type { DuplicateCodeGroup } from "./intelligence-types";

function normalizeCodeSnippet(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "") // remove comments
        .replace(/\s+/g, " ")                   // collapse whitespace
        .trim();
}

function hashCode(str: string): string {
    return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export function detectCodeDuplicates(
    files: { filePath: string; content: string }[],
    options: { minLines?: number; minCharacters?: number } = {}
): DuplicateCodeGroup[] {
    const minLines = options.minLines ?? 5;
    const minCharacters = options.minCharacters ?? 50;

    // Map normalized chunk hash -> array of instances
    const chunkMap = new Map<string, {
        filePath: string;
        startLine: number;
        endLine: number;
        snippet: string;
        lineCount: number;
    }[]>();

    for (const file of files) {
        const lines = file.content.split(/\r?\n/);
        if (lines.length < minLines) {
            continue;
        }

        // Sliding window of minLines
        for (let i = 0; i <= lines.length - minLines; i++) {
            const windowLines = lines.slice(i, i + minLines);
            const rawSnippet = windowLines.join("\n");
            const normalized = normalizeCodeSnippet(rawSnippet);

            if (normalized.length >= minCharacters) {
                const hash = hashCode(normalized);
                const existing = chunkMap.get(hash) ?? [];

                // Avoid overlapping windows in the same file
                const isOverlapping = existing.some(
                    inst => inst.filePath === file.filePath && Math.abs(inst.startLine - (i + 1)) < minLines
                );

                if (!isOverlapping) {
                    existing.push({
                        filePath: file.filePath,
                        startLine: i + 1,
                        endLine: i + minLines,
                        snippet: rawSnippet,
                        lineCount: minLines
                    });
                    chunkMap.set(hash, existing);
                }
            }
        }
    }

    const duplicateGroups: DuplicateCodeGroup[] = [];

    for (const [hash, instances] of chunkMap.entries()) {
        if (instances.length >= 2) {
            duplicateGroups.push({
                id: `dup:${hash}`,
                hash,
                similarity: 1.0,
                lineCount: instances[0]?.lineCount ?? minLines,
                instances
            });
        }
    }

    return duplicateGroups.sort((a, b) => b.instances.length - a.instances.length);
}
