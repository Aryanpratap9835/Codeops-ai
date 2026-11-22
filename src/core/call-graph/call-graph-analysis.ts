import { CallGraphResult } from "./call-graph-types";

function adjacency(graph: CallGraphResult): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const node of graph.nodes) map.set(node.id, []);
    for (const edge of graph.edges) {
        if (edge.resolution === "resolved" && edge.source && edge.target) {
            map.get(edge.source)?.push(edge.target);
        }
    }
    return map;
}

function reverseAdjacency(graph: CallGraphResult): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const node of graph.nodes) map.set(node.id, []);
    for (const edge of graph.edges) {
        if (edge.resolution === "resolved" && edge.source && edge.target) {
            map.get(edge.target)?.push(edge.source);
        }
    }
    return map;
}

function traverse(start: string, map: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const queue = [...(map.get(start) ?? [])];
    while (queue.length) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        queue.push(...(map.get(current) ?? []));
    }
    visited.delete(start);
    return [...visited];
}

export function getDirectCallees(graph: CallGraphResult, functionId: string): string[] {
    return [...new Set(adjacency(graph).get(functionId) ?? [])];
}

export function getTransitiveCallees(graph: CallGraphResult, functionId: string): string[] {
    return traverse(functionId, adjacency(graph));
}

export function getDirectCallers(graph: CallGraphResult, functionId: string): string[] {
    return [...new Set(reverseAdjacency(graph).get(functionId) ?? [])];
}

export function getTransitiveCallers(graph: CallGraphResult, functionId: string): string[] {
    return traverse(functionId, reverseAdjacency(graph));
}

export function getReachableFunctions(graph: CallGraphResult, entryPointIds: string[]): string[] {
    const map = adjacency(graph);
    const reachable = new Set<string>();
    const queue = [...entryPointIds];
    while (queue.length) {
        const current = queue.shift()!;
        if (reachable.has(current)) continue;
        reachable.add(current);
        queue.push(...(map.get(current) ?? []));
    }
    return [...reachable];
}

export function findRecursiveFunctions(graph: CallGraphResult): string[] {
    const map = adjacency(graph);
    const recursive: string[] = [];

    for (const node of graph.nodes) {
        const visited = new Set<string>();
        const queue = [...(map.get(node.id) ?? [])];
        let reachesSelf = false;

        while (queue.length > 0 && !reachesSelf) {
            const current = queue.shift()!;
            if (current === node.id) {
                reachesSelf = true;
                break;
            }
            if (visited.has(current)) continue;
            visited.add(current);
            queue.push(...(map.get(current) ?? []));
        }

        if (reachesSelf) recursive.push(node.id);
    }

    return recursive;
}

export function isFunctionReachable(
    graph: CallGraphResult,
    functionId: string,
    entryPointIds: string[]
): boolean {
    return getReachableFunctions(graph, entryPointIds).includes(functionId);
}
