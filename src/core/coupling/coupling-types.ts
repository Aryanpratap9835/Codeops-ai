export interface ModuleCouplingMetrics {
    filePath: string;
    fanIn: number;
    fanOut: number;
    incomingDependencies: string[];
    outgoingDependencies: string[];
    dependencyConcentration: number; // 0 to 1
    instability: number; // 0 (stable) to 1 (unstable)
    couplingScore: number; // 0 to 100
}

export interface SuspiciousPattern {
    filePath: string;
    patternType: "hub-module" | "excessive-dependencies" | "high-coupling" | "deep-dependent";
    description: string;
    evidence: string[];
}

export interface CouplingReport {
    modules: ModuleCouplingMetrics[];
    averageFanIn: number;
    averageFanOut: number;
    averageInstability: number;
    highlyConnectedModules: ModuleCouplingMetrics[];
    excessiveDependencyModules: ModuleCouplingMetrics[];
    centralModules: ModuleCouplingMetrics[];
    suspiciousPatterns: SuspiciousPattern[];
}
