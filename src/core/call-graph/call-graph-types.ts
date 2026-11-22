import type { SourceLocation } from "../parser/parser-types";

export interface CallGraphNode {
    id: string;
    name: string;
    qualifiedName: string;
    kind: "function" | "method";
    filePath: string;
    location: SourceLocation;
    exported: boolean;
    parentId: string | null;
}

export type CallResolution =
    | "resolved"
    | "unresolved"
    | "ambiguous"
    | "external";

export interface CallGraphEdge {
    id: string;
    source: string | null;
    target: string | null;
    callee: string;
    calleeKind: string;
    resolution: CallResolution;
    reason: string | null;
    filePath: string;
    location: SourceLocation;
}

export interface CallGraphResult {
    nodes: CallGraphNode[];
    edges: CallGraphEdge[];
}

export interface CallResolutionResult {
    targetId: string | null;
    resolution: CallResolution;
    reason: string | null;
}

export interface CallGraphAnalysis {
    functionId: string;
    directCallees: string[];
    transitiveCallees: string[];
    directCallers: string[];
    transitiveCallers: string[];
    reachable: boolean;
    recursive: boolean;
}