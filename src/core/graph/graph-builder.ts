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

    const repositoryFiles = parsedFiles.map(
        file => normalizePath(file.filePath)
    );

    const knownFiles = new Set(repositoryFiles);

    for (const filePath of repositoryFiles) {
        nodes.push({
            id: filePath,
            kind: "file",
            filePath
        });
    }

    const edgeIds = new Set<string>();

    function addEdge(
        source: string,
        specifier: string,
        kind: GraphEdge["kind"],
        isTypeOnly: boolean,
        index: number
    ): void {
        const target = resolveModule(
            rootPath,
            source,
            specifier,
            repositoryFiles
        );

        if (!target || !knownFiles.has(target)) {
            return;
        }

        const id = `${source}->${target}:${kind}:${index}`;

        if (edgeIds.has(id)) {
            return;
        }

        edgeIds.add(id);

        edges.push({
            id,
            source,
            target,
            kind,
            specifier,
            isTypeOnly
        });
    }

    for (const file of parsedFiles) {
        const source = normalizePath(file.filePath);

        // Static imports and dynamic imports.
        file.imports.forEach((importInfo, index) => {
            addEdge(
                source,
                importInfo.moduleSpecifier,
                importInfo.isDynamic
                    ? "dynamic-imports"
                    : "imports",
                importInfo.isTypeOnly,
                index
            );
        });

        // Re-exports are dependencies too.
        file.exports.forEach((exportInfo, index) => {
            if (!exportInfo.moduleSpecifier) {
                return;
            }

            addEdge(
                source,
                exportInfo.moduleSpecifier,
                "re-exports",
                exportInfo.isTypeOnly ?? false,
                index
            );
        });
    }

    return {
        nodes,
        edges
    };
}