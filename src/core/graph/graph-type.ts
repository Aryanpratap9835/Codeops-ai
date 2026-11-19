export interface GraphNode {
    id: string;
    kind: "file";
    filePath: string;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    kind: "imports";
    specifier: string;
    isTypeOnly: boolean;
}

export interface GraphResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface ImpactReport {
    changedFile: string;
    directDependents: string[];
    indirectDependents: string[];
    allAffectedFiles: string[];
    totalAffected: number;
}