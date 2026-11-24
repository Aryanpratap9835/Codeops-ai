import * as path from "node:path";
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import { findCircularDependencyGroups } from "../graph/graph-analysis";
import { createModuleResolver } from "../graph/module-resolver";
import { analyzeModuleCoupling } from "../coupling/coupling-analyzer";
import type {
    DependencyHealthReport,
    UnresolvedLocalImport,
    FragileStructure
} from "./health-types";

function normalize(p: string): string {
    return p.replace(/\\/g, "/");
}

export function analyzeDependencyHealth(
    rootPath: string,
    files: ParsedFile[],
    graph: GraphResult
): DependencyHealthReport {
    const filePaths = files.map(f => normalize(f.filePath));
    const resolver = createModuleResolver(rootPath, filePaths);

    // 1. Detect circular dependencies
    const circularGroups = findCircularDependencyGroups(graph);

    // 2. Detect unresolved local imports safely
    const unresolvedLocalImports: UnresolvedLocalImport[] = [];

    for (const file of files) {
        const importerFile = normalize(file.filePath);

        // Check imports
        for (const imp of file.imports) {
            if (imp.isTypeOnly) {
                // Check type-only imports too, but note it
            }

            if (resolver.isLocalSpecifier(imp.moduleSpecifier)) {
                const resolved = resolver.resolve(importerFile, imp.moduleSpecifier);

                if (!resolved) {
                    unresolvedLocalImports.push({
                        importerFile,
                        specifier: imp.moduleSpecifier,
                        isTypeOnly: imp.isTypeOnly,
                        location: {
                            line: imp.location.line,
                            column: imp.location.column
                        },
                        possibleReason:
                            "Local module file or index file does not exist at target path."
                    });
                }
            }
        }

        // Check re-exports
        for (const exp of file.exports) {
            if (!exp.moduleSpecifier) {
                continue;
            }

            if (resolver.isLocalSpecifier(exp.moduleSpecifier)) {
                const resolved = resolver.resolve(importerFile, exp.moduleSpecifier);

                if (!resolved) {
                    unresolvedLocalImports.push({
                        importerFile,
                        specifier: exp.moduleSpecifier,
                        isTypeOnly: exp.isTypeOnly ?? false,
                        location: {
                            line: exp.location.line,
                            column: exp.location.column
                        },
                        possibleReason:
                            "Local re-export target file does not exist at target path."
                    });
                }
            }
        }
    }

    // 3. Module coupling & high coupling files
    const coupling = analyzeModuleCoupling(graph);
    const highCouplingFiles = coupling.highlyConnectedModules.map(m => m.filePath);

    // 4. Fragile structures (bottlenecks and deep chains)
    const fragileStructures: FragileStructure[] = [];

    // Bottlenecks: high fan-in (>= 4) and high fan-out (>= 3)
    for (const m of coupling.modules) {
        if (m.fanIn >= 4 && m.fanOut >= 3) {
            fragileStructures.push({
                type: "bottleneck",
                description: `Module '${m.filePath}' acts as a critical bottleneck (fan-in: ${m.fanIn}, fan-out: ${m.fanOut}).`,
                affectedFiles: [...m.incomingDependencies, ...m.outgoingDependencies],
                severity: m.fanIn >= 6 ? "high" : "medium"
            });
        }
    }

    // Deep chains: calculate max path depth from graph edges
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const src = normalize(edge.source);
        const tgt = normalize(edge.target);
        if (!adjacency.has(src)) adjacency.set(src, []);
        adjacency.get(src)!.push(tgt);
    }

    const memoDepth = new Map<string, number>();
    const visiting = new Set<string>();

    function getChainDepth(node: string): number {
        if (visiting.has(node)) return 0; // Skip cycle loops in depth calculation
        if (memoDepth.has(node)) return memoDepth.get(node)!;

        visiting.add(node);
        let maxSub = 0;

        for (const neighbor of adjacency.get(node) ?? []) {
            maxSub = Math.max(maxSub, 1 + getChainDepth(neighbor));
        }

        visiting.delete(node);
        memoDepth.set(node, maxSub);
        return maxSub;
    }

    let maxGraphDepth = 0;
    let deepRoot = "";

    for (const node of graph.nodes) {
        const depth = getChainDepth(normalize(node.id));
        if (depth > maxGraphDepth) {
            maxGraphDepth = depth;
            deepRoot = node.id;
        }
    }

    if (maxGraphDepth >= 6) {
        fragileStructures.push({
            type: "deep-chain",
            description: `Deep dependency chain detected with maximum depth of ${maxGraphDepth} originating near '${deepRoot}'.`,
            affectedFiles: [deepRoot],
            severity: maxGraphDepth >= 9 ? "high" : "medium"
        });
    }

    // 5. Health score calculation
    let healthScore = 100;
    healthScore -= circularGroups.length * 25;
    healthScore -= unresolvedLocalImports.length * 20;
    healthScore -= fragileStructures.filter(f => f.severity === "high").length * 10;
    healthScore -= fragileStructures.filter(f => f.severity === "medium").length * 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const status: DependencyHealthReport["status"] =
        (circularGroups.length > 0 || unresolvedLocalImports.length > 0)
            ? (healthScore < 50 ? "critical" : "warning")
            : (healthScore >= 80 ? "healthy" : "warning");

    const summary: string[] = [];
    if (circularGroups.length > 0) {
        summary.push(`${circularGroups.length} circular dependency group(s) detected.`);
    }
    if (unresolvedLocalImports.length > 0) {
        summary.push(`${unresolvedLocalImports.length} unresolved local import(s) detected.`);
    }
    if (fragileStructures.length > 0) {
        summary.push(`${fragileStructures.length} structural fragility risk(s) identified.`);
    }
    if (summary.length === 0) {
        summary.push("Dependency graph is structurally sound with no cycles or missing local modules.");
    }

    return {
        healthScore,
        status,
        circularDependencyCount: circularGroups.length,
        circularDependencyGroups: circularGroups,
        unresolvedLocalImports,
        highCouplingFiles,
        fragileStructures,
        summary
    };
}
