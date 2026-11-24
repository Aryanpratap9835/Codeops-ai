export interface UnresolvedLocalImport {
    importerFile: string;
    specifier: string;
    isTypeOnly: boolean;
    location: {
        line: number;
        column: number;
    };
    possibleReason: string;
}

export interface FragileStructure {
    type: "deep-chain" | "bottleneck" | "isolated-island";
    description: string;
    affectedFiles: string[];
    severity: "low" | "medium" | "high";
}

export interface DependencyHealthReport {
    healthScore: number; // 0 (critical) to 100 (healthy)
    status: "healthy" | "warning" | "critical";
    circularDependencyCount: number;
    circularDependencyGroups: string[][];
    unresolvedLocalImports: UnresolvedLocalImport[];
    highCouplingFiles: string[];
    fragileStructures: FragileStructure[];
    summary: string[];
}
