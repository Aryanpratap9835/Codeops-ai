import type { SourceLocation } from "../parser/parser-types";

// 1. Control Flow Graph Types
export type CFGNodeType =
    | "entry"
    | "exit"
    | "statement"
    | "branch"
    | "loop"
    | "return"
    | "throw"
    | "try"
    | "catch"
    | "finally";

export interface CFGNode {
    id: string;
    type: CFGNodeType;
    label: string;
    location: SourceLocation | null;
    successors: string[];
    predecessors: string[];
}

export interface ControlFlowGraph {
    functionName: string;
    filePath: string;
    entryNodeId: string;
    exitNodeId: string;
    nodes: CFGNode[];
    unreachableNodes: CFGNode[];
}

// 2. Data Flow Types
export interface VariableDef {
    name: string;
    line: number;
    column: number;
    kind: "const" | "let" | "var" | "parameter";
}

export interface VariableUse {
    name: string;
    line: number;
    column: number;
    type: "read" | "write";
}

export interface DataFlowIssue {
    type: "unused-assignment" | "potential-use-before-def";
    variableName: string;
    filePath: string;
    line: number;
    column: number;
    message: string;
}

export interface DataFlowReport {
    functionName: string;
    filePath: string;
    definitions: VariableDef[];
    uses: VariableUse[];
    issues: DataFlowIssue[];
}

// 3. Taint Analysis Types
export type TaintSourceKind = "http-param" | "http-body" | "http-query" | "env" | "external-input";
export type TaintSinkKind = "sql" | "shell" | "filesystem" | "html-render" | "eval";

export interface TaintFlow {
    id: string;
    source: {
        kind: TaintSourceKind;
        expression: string;
        location: SourceLocation;
    };
    sink: {
        kind: TaintSinkKind;
        expression: string;
        location: SourceLocation;
    };
    propagationPath: string[];
    isSanitized: boolean;
    sanitizer?: string;
    confidence: "high" | "medium" | "low";
    filePath: string;
}

// 4. Complexity Analysis Types
export interface FunctionComplexity {
    name: string;
    filePath: string;
    line: number;
    cyclomaticComplexity: number;
    nestingDepth: number;
    lineCount: number;
    parameterCount: number;
    maintainabilityIndex: number; // 0 to 100
    isComplex: boolean;
}

// 5. Code Duplication Types
export interface DuplicateCodeGroup {
    id: string;
    hash: string;
    similarity: number; // 0 to 1
    lineCount: number;
    instances: {
        filePath: string;
        startLine: number;
        endLine: number;
        snippet: string;
    }[];
}

// 6. Aggregated Intelligence Report
export interface AdvancedIntelligenceReport {
    cfgs: ControlFlowGraph[];
    unreachableCodeCount: number;
    dataFlowIssues: DataFlowIssue[];
    taintFlows: TaintFlow[];
    unsanitizedTaintCount: number;
    duplicateGroups: DuplicateCodeGroup[];
    complexFunctions: FunctionComplexity[];
    averageComplexity: number;
}
