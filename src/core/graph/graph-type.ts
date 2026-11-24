export interface GraphNode {
    id: string;
    kind: "file";
    filePath: string;
}

export type GraphEdgeKind =
    | "imports"
    | "re-exports"
    | "dynamic-imports";

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    kind: GraphEdgeKind;
    specifier: string;
    isTypeOnly: boolean;
}

export interface GraphResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface AffectedItemReason {
    filePath: string;
    targetSymbol?: string;
    relation: "direct-dependent" | "transitive-dependent" | "function-call";
    depth: number;
    explanation: string;
}

export interface AffectedFunction {
    functionId: string;
    name: string;
    filePath: string;
    calleeName: string;
    explanation: string;
}

export interface ImpactReport {
    changedFile: string;
    directDependents: string[];
    indirectDependents: string[];
    allAffectedFiles: string[];
    totalAffected: number;
}

export interface AdvancedImpactReport extends ImpactReport {
    impactDepth: number;
    affectedFunctions: AffectedFunction[];
    highRiskAffectedFiles: string[];
    explanations: AffectedItemReason[];
}
