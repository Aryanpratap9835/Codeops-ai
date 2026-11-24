import type { SecurityFinding } from "../security/security-types";

export interface GitChangeSummary {
    isGitRepo: boolean;
    currentBranch: string | null;
    baseBranch: string | null;
    changedFiles: {
        filePath: string;
        status: "added" | "modified" | "deleted";
    }[];
}

export interface QualityGateConfig {
    maxCriticalSecurity?: number;
    maxHighSecurity?: number;
    allowNewCircularDependencies?: boolean;
    maxArchitectureViolations?: number;
    maxUnresolvedLocalImports?: number;
    failOnSeverity?: "critical" | "high" | "medium" | "low";
}

export interface QualityGateResult {
    passed: boolean;
    failures: string[];
    warnings: string[];
    metrics: {
        criticalSecurity: number;
        highSecurity: number;
        circularDependencies: number;
        architectureViolations: number;
        unresolvedLocalImports: number;
    };
}

// SARIF 2.1.0 Types
export interface SarifRule {
    id: string;
    name: string;
    shortDescription: { text: string };
    fullDescription?: { text: string };
    defaultConfiguration: {
        level: "error" | "warning" | "note";
    };
    helpUri?: string;
    properties?: Record<string, unknown>;
}

export interface SarifResult {
    ruleId: string;
    level: "error" | "warning" | "note";
    message: { text: string };
    locations: {
        physicalLocation: {
            artifactLocation: { uri: string };
            region: {
                startLine: number;
                startColumn?: number;
                endLine?: number;
                endColumn?: number;
            };
        };
    }[];
}

export interface SarifLog {
    $schema: string;
    version: "2.1.0";
    runs: {
        tool: {
            driver: {
                name: string;
                version: string;
                informationUri: string;
                rules: SarifRule[];
            };
        };
        results: SarifResult[];
    }[];
}
