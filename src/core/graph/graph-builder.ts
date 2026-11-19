
import * as path from "node:path";

import { ParsedFile } from "../parser/parser-types";
import { GraphNode, GraphEdge, GraphResult } from "./graph-type";
import { resolveModule } from "./module-resolver";

function normalizePath(filePath: string): string {
    return filePath.split(path.sep).join("/");
}

export function buildDependencyGraph(
    rootPath: string,
    parsedFiles: ParsedFile[]
): GraphResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Only successfully parsed files belong to this graph.
    const repositoryFiles = parsedFiles.map(
        file => normalizePath(file.filePath)
    );

    const knownFiles = new Set(repositoryFiles);

    // Step 1: Create one node per parsed file.
    for (const filePath of repositoryFiles) {
        nodes.push({
            id: filePath,
            kind: "file",
            filePath
        });
    }

    // Step 2: Resolve imports and create dependency edges.
    for (const file of parsedFiles) {
        const source = normalizePath(file.filePath);

        file.imports.forEach((importInfo, index) => {
            const target = resolveModule(
                rootPath,
                file.filePath,
                importInfo.moduleSpecifier,
                repositoryFiles
            );

            // Ignore unresolved imports and external packages.
            if (!target || !knownFiles.has(target)) {
                return;
            }

            edges.push({
                id: `${source}->${target}:${index}`,
                source,
                target,
                kind: "imports",
                specifier: importInfo.moduleSpecifier,
                isTypeOnly: importInfo.isTypeOnly
            });
        });
    }

    return {
        nodes,
        edges
    };
}