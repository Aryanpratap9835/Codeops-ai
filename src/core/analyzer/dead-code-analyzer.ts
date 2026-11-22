
import * as path from "node:path";

import type { ParsedFile } from "../parser/parser-types";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import type { DeadCodeCandidate } from "./analysis-types";

const ENTRY_POINT_NAMES = new Set([
    "index",
    "main",
    "server",
    "app",
    "cli"
]);

function isEntryPointFile(filePath: string): boolean {
    const filename = path.posix.basename(
        filePath.replace(/\\/g, "/"),
        path.posix.extname(filePath)
    ).toLowerCase();

    return ENTRY_POINT_NAMES.has(filename);
}

export function findDeadCodeCandidates(
    files: ParsedFile[],
    callGraph: CallGraphResult
): DeadCodeCandidate[] {
    const referencedSymbols = new Set<string>();

    for (const edge of callGraph.edges) {
        if (edge.resolution === "resolved" && edge.target) {
            referencedSymbols.add(edge.target);
        }
    }

    const candidates: DeadCodeCandidate[] = [];

    for (const file of files) {
        if (isEntryPointFile(file.filePath)) {
            continue;
        }

        for (const symbol of file.symbols) {
            if (symbol.kind !== "function") {
                continue;
            }

            if (symbol.parentId !== null || symbol.exported) {
                continue;
            }

            if (symbol.name.startsWith("<anonymous@")) {
                continue;
            }

            if (referencedSymbols.has(symbol.id)) {
                continue;
            }

            candidates.push({
                symbolId: symbol.id,
                name: symbol.name,
                qualifiedName: symbol.qualifiedName,
                filePath: symbol.filePath,
                location: symbol.location,
                reason:
                    "Non-exported top-level function has no statically resolved callers."
            });
        }
    }

    return candidates;
}