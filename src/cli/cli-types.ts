import type { RepositoryAnalysis } from "../core/analyzer/analysis-types";
import type { ArchitectureReport } from "../core/architecture/architecture-types";
import type { CouplingReport } from "../core/coupling/coupling-types";
import type { DependencyHealthReport } from "../core/health/health-types";
import type { HotspotReport } from "../core/analyzer/hotspot-analyzer";
import type { AdvancedImpactReport } from "../core/graph/graph-type";
import type { SecurityReport } from "../core/security/security-types";

export const CODEOPS_SCHEMA_VERSION = "1.0.0";

export interface CodeOpsRecommendation {
    category: "architecture" | "dependency" | "risk" | "maintainability";
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    targetFiles: string[];
    remediation: string;
}

export interface MachineReadableReport {
    schemaVersion: string;
    generatedAt: string;
    repository: {
        path: string;
        scannedFiles: number;
        parsedFiles: number;
        scanErrors: number;
        parseErrors: number;
    };
    graph: {
        nodeCount: number;
        edgeCount: number;
        cyclesCount: number;
        sccCount: number;
    };
    architecture: ArchitectureReport;
    coupling: CouplingReport;
    dependencyHealth: DependencyHealthReport;
    hotspots: HotspotReport;
    security?: SecurityReport;
    analysis: RepositoryAnalysis;
    recommendations: CodeOpsRecommendation[];
}

export interface ExplainReport {
    filePath: string;
    layer: string;
    confidence: string;
    riskScore: number;
    riskLevel: string;
    coupling: {
        fanIn: number;
        fanOut: number;
        instability: number;
        couplingScore: number;
    };
    findings: {
        id: string;
        category: string;
        severity: string;
        title: string;
        message: string;
        evidence: string[];
        remediation?: string;
    }[];
    impact: {
        directDependents: string[];
        totalAffected: number;
        depth: number;
    };
    explanation: string;
    recommendations: string[];
}
