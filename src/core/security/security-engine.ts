import * as fs from "node:fs";
import ts from "typescript";
import type {
    SecurityFinding,
    SecurityReport,
    SecurityScoreReport,
    SecuritySeverity,
    SecurityCategory,
    SecurityConfidence
} from "./security-types";
import { detectSecrets } from "./detectors/secret-detector";
import { detectInjections } from "./detectors/injection-detector";
import { detectAuthAndCrypto } from "./detectors/auth-crypto-detector";

export function analyzeSecurityForFile(
    filePath: string,
    content: string,
    allowlist?: string[]
): SecurityFinding[] {
    const scriptKind = filePath.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : filePath.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : filePath.endsWith(".js")
                ? ts.ScriptKind.JS
                : ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
    );

    const context = {
        filePath,
        content,
        sourceFile,
        allowlist
    };

    const secrets = detectSecrets(context);
    const injections = detectInjections(context);
    const authCrypto = detectAuthAndCrypto(context);

    return [...secrets, ...injections, ...authCrypto];
}

export function computeSecurityScore(findings: SecurityFinding[]): SecurityScoreReport {
    const severityDistribution: Record<SecuritySeverity, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
    };

    const categoryDistribution: Record<SecurityCategory, number> = {
        secret: 0,
        injection: 0,
        auth: 0,
        crypto: 0,
        traversal: 0
    };

    const confidenceDistribution: Record<SecurityConfidence, number> = {
        high: 0,
        medium: 0,
        low: 0
    };

    const fileMap = new Map<string, { count: number; maxSev: SecuritySeverity }>();
    const severityRank: Record<SecuritySeverity, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
        info: 0
    };

    let penalty = 0;

    for (const f of findings) {
        severityDistribution[f.severity]++;
        categoryDistribution[f.category]++;
        confidenceDistribution[f.confidence]++;

        switch (f.severity) {
            case "critical":
                penalty += 25;
                break;
            case "high":
                penalty += 15;
                break;
            case "medium":
                penalty += 8;
                break;
            case "low":
                penalty += 3;
                break;
            case "info":
                penalty += 0;
                break;
        }

        const curr = fileMap.get(f.filePath) ?? { count: 0, maxSev: f.severity };
        curr.count++;
        if (severityRank[f.severity] > severityRank[curr.maxSev]) {
            curr.maxSev = f.severity;
        }
        fileMap.set(f.filePath, curr);
    }

    const score = Math.max(0, Math.min(100, 100 - penalty));

    const grade: SecurityScoreReport["grade"] =
        score >= 90 ? "A" :
            score >= 80 ? "B" :
                score >= 70 ? "C" :
                    score >= 60 ? "D" : "F";

    const mostDangerousFiles = [...fileMap.entries()]
        .map(([filePath, val]) => ({
            filePath,
            findingCount: val.count,
            maxSeverity: val.maxSev
        }))
        .sort((a, b) => severityRank[b.maxSeverity] - severityRank[a.maxSeverity] || b.findingCount - a.findingCount);

    const topCategories = (Object.keys(categoryDistribution) as SecurityCategory[])
        .map(cat => ({ category: cat, count: categoryDistribution[cat] }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);

    return {
        score,
        grade,
        totalFindings: findings.length,
        severityDistribution,
        categoryDistribution,
        confidenceDistribution,
        mostDangerousFiles,
        topCategories
    };
}

export function analyzeSecurity(
    files: { filePath: string; content?: string }[],
    options: { allowlist?: string[] } = {}
): SecurityReport {
    const allFindings: SecurityFinding[] = [];

    for (const file of files) {
        let content = file.content;
        if (content === undefined && fs.existsSync(file.filePath)) {
            try {
                content = fs.readFileSync(file.filePath, "utf-8");
            } catch {
                continue;
            }
        }

        if (content !== undefined) {
            const findings = analyzeSecurityForFile(file.filePath, content, options.allowlist);
            allFindings.push(...findings);
        }
    }

    // Sort findings by severity
    const severityRank: Record<SecuritySeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4
    };

    allFindings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    return {
        findings: allFindings,
        summary: computeSecurityScore(allFindings)
    };
}
