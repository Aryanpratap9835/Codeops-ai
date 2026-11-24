export type ArchitecturalLayer =
    | "controllers"
    | "routes"
    | "services"
    | "repositories"
    | "models"
    | "middleware"
    | "utilities"
    | "config"
    | "tests"
    | "components"
    | "unclassified";

export type ClassificationConfidence = "high" | "medium" | "low";

export interface ClassifiedFile {
    filePath: string;
    layer: ArchitecturalLayer;
    confidence: ClassificationConfidence;
    evidence: string[];
}

export interface LayerDependency {
    sourceLayer: ArchitecturalLayer;
    targetLayer: ArchitecturalLayer;
    edgeCount: number;
    sampleEdges: { source: string; target: string; specifier: string }[];
}

export interface LayerSummary {
    layer: ArchitecturalLayer;
    fileCount: number;
    files: string[];
}

export interface ArchitectureReport {
    layers: LayerSummary[];
    classifiedFiles: ClassifiedFile[];
    layerDependencies: LayerDependency[];
    unclassifiedFiles: string[];
    unclassifiedPercentage: number;
    organizationIssues: string[];
}
