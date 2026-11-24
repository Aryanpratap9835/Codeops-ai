import type { SourceLocation } from "../parser/parser-types";

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityCategory =
    | "secret"
    | "injection"
    | "auth"
    | "crypto"
    | "traversal";

export type SecurityConfidence = "high" | "medium" | "low";

export interface SecurityFinding {
    id: string;
    ruleId: string;
    ruleName: string;
    severity: SecuritySeverity;
    category: SecurityCategory;
    confidence: SecurityConfidence;
    title: string;
    message: string;
    filePath: string;
    location: SourceLocation | null;
    evidence: string[];
    remediation: string;
    cwe?: string;
    owasp?: string;
    snippet?: string;
}

export interface SecurityScoreReport {
    score: number; // 0 to 100
    grade: "A" | "B" | "C" | "D" | "F";
    totalFindings: number;
    severityDistribution: Record<SecuritySeverity, number>;
    categoryDistribution: Record<SecurityCategory, number>;
    confidenceDistribution: Record<SecurityConfidence, number>;
    mostDangerousFiles: { filePath: string; findingCount: number; maxSeverity: SecuritySeverity }[];
    topCategories: { category: SecurityCategory; count: number }[];
}

export interface SecurityReport {
    findings: SecurityFinding[];
    summary: SecurityScoreReport;
}

export interface SecurityContext {
    filePath: string;
    content: string;
    sourceFile: import("typescript").SourceFile;
    allowlist?: string[];
}
