
import type {
    ParsedFile,
    SourceLocation,
    SymbolInfo
} from "../parser/parser-types";

export type FindingSeverity =
    | "info"
    | "low"
    | "medium"
    | "high"
    | "critical";

export type FindingCategory =
    | "dead-code"
    | "dependency"
    | "call-resolution"
    | "risk"
    | "code-quality";

export interface AnalysisFinding {
    id: string;
    ruleId: string;
    category: FindingCategory;
    severity: FindingSeverity;
    title: string;
    message: string;
    filePath: string | null;
    location: SourceLocation | null;
    evidence: string[];
}

export interface SymbolReference {
    symbolId: string;
    referenceCount: number;
    callers: string[];
}

export interface SemanticAnalysis {
    references: SymbolReference[];
    unresolvedCallCount: number;
    ambiguousCallCount: number;
    resolvedCallCount: number;
}

export interface DeadCodeCandidate {
    symbolId: string;
    name: string;
    qualifiedName: string;
    filePath: string;
    location: SourceLocation;
    reason: string;
}

export interface FileMetrics {
    filePath: string;
    symbolCount: number;
    functionCount: number;
    classCount: number;
    importCount: number;
    callCount: number;
    unresolvedCallCount: number;
    incomingDependencies: number;
    outgoingDependencies: number;
}

export interface RepositoryMetrics {
    fileCount: number;
    symbolCount: number;
    functionCount: number;
    classCount: number;
    importCount: number;
    callCount: number;
    resolvedCallCount: number;
    unresolvedCallCount: number;
    ambiguousCallCount: number;
    circularDependencyCount: number;
    deadCodeCandidateCount: number;
    files: FileMetrics[];
}

export interface FileRisk {
    filePath: string;
    score: number;
    level: "low" | "medium" | "high";
    reasons: string[];
    incomingDependencies: number;
    outgoingDependencies: number;
    unresolvedCalls: number;
    diagnostics: number;
    circularDependency: boolean;
}

export interface RepositoryAnalysis {
    metrics: RepositoryMetrics;
    semantic: SemanticAnalysis;
    deadCodeCandidates: DeadCodeCandidate[];
    risks: FileRisk[];
    findings: AnalysisFinding[];
    parseErrors: {
        filePath: string;
        code: string;
        message: string;
    }[];
}

export interface AnalysisInput {
    files: ParsedFile[];
    dependencyGraph: import("../graph/graph-type").GraphResult;
    callGraph: import("../call-graph/call-graph-types").CallGraphResult;
}