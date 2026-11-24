

import {
    GraphResult,
    ImpactReport,
    AdvancedImpactReport,
    AffectedItemReason,
    AffectedFunction
} from "./graph-type";
/**
 * Returns files that directly import the target file.
 */
export function getDirectDependents(
    graph: GraphResult,
    targetFilePath: string
): string[] {
    const dependents = new Set<string>();

    for (const edge of graph.edges) {
        if (edge.target === targetFilePath) {
            dependents.add(edge.source);
        }
    }

    return [...dependents];
}

/**
 * Returns all direct and indirect dependents
 * of the target file.
 */
export function getTransitiveDependents(
    graph: GraphResult,
    targetFilePath: string
): string[] {
    // Build reverse adjacency list.
    const reverseAdjacency = new Map<string, string[]>();

    for (const edge of graph.edges) {
        const existing = reverseAdjacency.get(edge.target) ?? [];

        existing.push(edge.source);

        reverseAdjacency.set(edge.target, existing);
    }

    const visited = new Set<string>();
    const queue: string[] = [targetFilePath];

    visited.add(targetFilePath);

    const dependents: string[] = [];

    // BFS traversal.
    let head = 0;

    while (head < queue.length) {
        const current = queue[head++];

        const neighbors = reverseAdjacency.get(current) ?? [];

        for (const neighbor of neighbors) {
            if (visited.has(neighbor)) {
                continue;
            }

            visited.add(neighbor);
            dependents.push(neighbor);
            queue.push(neighbor);
        }
    }

    return dependents;
}

/**
 * Finds cycle paths in a directed dependency graph.
 *
 * Each returned cycle starts and ends at the same file.
 * Uses DFS back edges to identify cycle witnesses.
 */
export function detectCycles(graph: GraphResult): string[][] {
    // Build adjacency list: importer -> imported files.
    const adjacency = new Map<string, string[]>();

    for (const node of graph.nodes) {
        adjacency.set(node.id, []);
    }

    for (const edge of graph.edges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, []);
        }

        if (!adjacency.has(edge.target)) {
            adjacency.set(edge.target, []);
        }

        adjacency.get(edge.source)!.push(edge.target);
    }

    // 0 = unvisited, 1 = visiting, 2 = visited.
    const state = new Map<string, 0 | 1 | 2>();

    // Tracks the active DFS path.
    const stack: string[] = [];
    const stackIndex = new Map<string, number>();

    const cycles: string[][] = [];

    function dfs(current: string): void {
        state.set(current, 1);
        stackIndex.set(current, stack.length);
        stack.push(current);

        for (const neighbor of adjacency.get(current) ?? []) {
            const neighborState = state.get(neighbor) ?? 0;

            if (neighborState === 0) {
                dfs(neighbor);
            } else if (neighborState === 1) {
                // Neighbor is already in the active DFS path.
                // Extract the cycle and repeat its starting node at the end.
                const cycleStart = stackIndex.get(neighbor)!;
                const cycle = [
                    ...stack.slice(cycleStart),
                    neighbor
                ];

                cycles.push(cycle);
            }
        }

        stack.pop();
        stackIndex.delete(current);
        state.set(current, 2);
    }

    // Visit every component, including disconnected components.
    for (const node of adjacency.keys()) {
        if ((state.get(node) ?? 0) === 0) {
            dfs(node);
        }
    }

    return cycles;
}



/**
 * Returns every file affected by a change.
 * The changed file itself is excluded.
 */
export function getAffectedFiles(
    graph: GraphResult,
    changedFile: string
): string[] {
    return getTransitiveDependents(graph, changedFile);
}

/**
 * Generates a structured impact report for a changed file.
 */
export function getImpactReport(
    graph: GraphResult,
    changedFile: string
): ImpactReport {
    const directDependents = getDirectDependents(graph, changedFile);

    const allAffectedFiles = getAffectedFiles(graph, changedFile);

    const directSet = new Set(directDependents);

    const indirectDependents = allAffectedFiles.filter(
        (file) => !directSet.has(file)
    );

    return {
        changedFile,
        directDependents,
        indirectDependents,
        allAffectedFiles,
        totalAffected: allAffectedFiles.length
    };
}

/**
 * Generates an advanced impact report with depth, explanations, and affected functions.
 */
export function getAdvancedImpactReport(
    graph: GraphResult,
    changedFile: string,
    options?: {
        callGraph?: import("../call-graph/call-graph-types").CallGraphResult;
        targetSymbolName?: string;
        highRiskFiles?: string[];
    }
): AdvancedImpactReport {
    const base = getImpactReport(graph, changedFile);

    const directSet = new Set(base.directDependents);

    // Compute depth for each affected file using BFS from changedFile
    const reverseAdjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const src = edge.source;
        const tgt = edge.target;
        if (!reverseAdjacency.has(tgt)) reverseAdjacency.set(tgt, []);
        reverseAdjacency.get(tgt)!.push(src);
    }

    const depthMap = new Map<string, number>();
    depthMap.set(changedFile, 0);

    const queue: string[] = [changedFile];
    let head = 0;

    while (head < queue.length) {
        const current = queue[head++];
        const currentDepth = depthMap.get(current)!;

        for (const neighbor of reverseAdjacency.get(current) ?? []) {
            if (!depthMap.has(neighbor)) {
                depthMap.set(neighbor, currentDepth + 1);
                queue.push(neighbor);
            }
        }
    }

    let maxDepth = 0;
    const explanations: AffectedItemReason[] = [];

    for (const file of base.allAffectedFiles) {
        const depth = depthMap.get(file) ?? 1;
        if (depth > maxDepth) {
            maxDepth = depth;
        }

        const relation = directSet.has(file) ? "direct-dependent" : "transitive-dependent";
        const explanation = relation === "direct-dependent"
            ? `Directly imports '${changedFile}'.`
            : `Transitively depends on '${changedFile}' at depth ${depth}.`;

        explanations.push({
            filePath: file,
            relation,
            depth,
            explanation
        });
    }

    // Function-level impact if callGraph is provided
    const affectedFunctions: AffectedFunction[] = [];
    if (options?.callGraph) {
        const callGraph = options.callGraph;
        const targetNodes = callGraph.nodes.filter(n => n.filePath === changedFile);
        const targetNodeIds = new Set(
            options.targetSymbolName
                ? targetNodes.filter(n => n.name === options.targetSymbolName).map(n => n.id)
                : targetNodes.map(n => n.id)
        );

        for (const edge of callGraph.edges) {
            if (edge.resolution === "resolved" && edge.target && targetNodeIds.has(edge.target)) {
                const callerNode = callGraph.nodes.find(n => n.id === edge.source);
                if (callerNode && callerNode.filePath !== changedFile) {
                    affectedFunctions.push({
                        functionId: callerNode.id,
                        name: callerNode.name,
                        filePath: callerNode.filePath,
                        calleeName: edge.callee,
                        explanation: `Function '${callerNode.name}' calls '${edge.callee}' in modified file.`
                    });
                }
            }
        }
    }

    const highRiskSet = new Set(options?.highRiskFiles ?? []);
    const highRiskAffectedFiles = base.allAffectedFiles.filter(f => highRiskSet.has(f));

    return {
        ...base,
        impactDepth: maxDepth,
        affectedFunctions,
        highRiskAffectedFiles,
        explanations
    };
}

/**
 * Finds all Strongly Connected Components (SCCs).
 *
 * Every node in an SCC can reach every other node
 * through directed paths.
 */
export function findStronglyConnectedComponents(
    graph: GraphResult
): string[][] {
    const adjacency = new Map<string, string[]>();

    // Create adjacency entries for every node.
    for (const node of graph.nodes) {
        adjacency.set(node.id, []);
    }

    // Include graph edge endpoints as well.
    for (const edge of graph.edges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, []);
        }

        if (!adjacency.has(edge.target)) {
            adjacency.set(edge.target, []);
        }

        adjacency.get(edge.source)!.push(edge.target);
    }

    let nextIndex = 0;

    const index = new Map<string, number>();
    const lowLink = new Map<string, number>();

    const stack: string[] = [];
    const onStack = new Set<string>();

    const components: string[][] = [];

    function strongConnect(node: string): void {
        // Assign discovery index and initial low-link value.
        index.set(node, nextIndex);
        lowLink.set(node, nextIndex);
        nextIndex++;

        stack.push(node);
        onStack.add(node);

        for (const neighbor of adjacency.get(node) ?? []) {
            if (!index.has(neighbor)) {
                // Neighbor has not been visited.
                strongConnect(neighbor);

                lowLink.set(
                    node,
                    Math.min(
                        lowLink.get(node)!,
                        lowLink.get(neighbor)!
                    )
                );
            } else if (onStack.has(neighbor)) {
                // Neighbor is still part of an active SCC.
                lowLink.set(
                    node,
                    Math.min(
                        lowLink.get(node)!,
                        index.get(neighbor)!
                    )
                );
            }
        }

        // This node is the root of an SCC.
        if (lowLink.get(node) === index.get(node)) {
            const component: string[] = [];

            while (stack.length > 0) {
                const member = stack.pop()!;
                onStack.delete(member);
                component.push(member);

                if (member === node) {
                    break;
                }
            }

            // Stable ordering makes reports and tests predictable.
            component.sort();
            components.push(component);
        }
    }

    // Process disconnected components too.
    for (const node of adjacency.keys()) {
        if (!index.has(node)) {
            strongConnect(node);
        }
    }

    return components;
}

/**
 * Returns only components that contain circular dependencies.
 *
 * A component is circular if:
 * - It contains more than one node, or
 * - It contains one node with a self-loop.
 */
export function findCircularDependencyGroups(
    graph: GraphResult
): string[][] {
    const components = findStronglyConnectedComponents(graph);

    const selfLoops = new Set<string>();

    for (const edge of graph.edges) {
        if (edge.source === edge.target) {
            selfLoops.add(edge.source);
        }
    }

    return components.filter((component) => {
        if (component.length > 1) {
            return true;
        }

        return selfLoops.has(component[0]);
    });
}