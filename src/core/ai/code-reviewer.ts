import * as path from "node:path";
import * as fs from "node:fs";
import { getGitChanges } from "../workflow/git-integration";
import { scanRepository } from "../repository/scanner";
import { parseRepository } from "../parser/parser";
import { buildDependencyGraph } from "../graph/graph-builder";
import { analyzeSecurity } from "../security/security-engine";
import { analyzeRepository } from "../rules/analysis-engine";
import { buildCallGraph } from "../call-graph/call-graph-builder";
import type { ModelProvider, ReviewResult, ReviewComment } from "./ai-types";
import { MockModelProvider } from "./mock-provider";

const defaultProvider = new MockModelProvider();

export async function reviewCodeChanges(
    repoPath: string,
    baseRef?: string,
    provider: ModelProvider = defaultProvider
): Promise<ReviewResult> {
    const gitChanges = getGitChanges(repoPath, baseRef);
    const changedFilePaths = gitChanges.changedFiles.map(f => f.filePath);

    const scanResult = await scanRepository(repoPath);
    const parseResult = await parseRepository(repoPath, scanResult.files);
    const dependencyGraph = buildDependencyGraph(repoPath, parseResult.files);
    const callGraph = buildCallGraph(parseResult.files, repoPath);

    const securityReport = analyzeSecurity(parseResult.files);
    const analysisReport = analyzeRepository({
        files: parseResult.files,
        dependencyGraph,
        callGraph
    });

    // Match findings on changed files (or on all files if working tree is clean)
    const targetFileSet = new Set(
        changedFilePaths.length > 0
            ? changedFilePaths.map(p => p.replace(/\\/g, "/"))
            : parseResult.files.map(f => f.filePath.replace(/\\/g, "/"))
    );

    const comments: ReviewComment[] = [];
    const risksIdentified: string[] = [];

    // 1. Security findings
    for (const sec of securityReport.findings) {
        const norm = sec.filePath.replace(/\\/g, "/");
        const isTarget = Array.from(targetFileSet).some(t => norm.endsWith(t) || t.endsWith(norm));
        if (isTarget) {
            comments.push({
                filePath: sec.filePath,
                line: sec.location ? sec.location.line : undefined,
                severity: sec.severity === "critical" || sec.severity === "high" ? "error" : "warning",
                message: `[Security] ${sec.title}: ${sec.message}`,
                suggestion: sec.remediation,
                ruleId: sec.ruleId
            });
            risksIdentified.push(`${sec.title} in ${sec.filePath}`);
        }
    }

    // 2. Architecture and rule findings
    for (const f of analysisReport.findings) {
        if (!f.filePath) continue;
        const norm = f.filePath.replace(/\\/g, "/");
        const isTarget = Array.from(targetFileSet).some(t => norm.endsWith(t) || t.endsWith(norm));
        if (isTarget) {
            comments.push({
                filePath: f.filePath,
                line: f.location?.line,
                severity: f.severity === "high" ? "error" : f.severity === "medium" ? "warning" : "info",
                message: `[Quality] ${f.title}: ${f.message}`,
                suggestion: Array.isArray(f.evidence) ? f.evidence.join("; ") : String(f.evidence),
                ruleId: f.id
            });
        }
    }

    // Determine overall assessment
    const hasErrors = comments.some(c => c.severity === "error");
    const hasWarnings = comments.some(c => c.severity === "warning");

    let overallAssessment: "approve" | "request_changes" | "comment";
    if (hasErrors) {
        overallAssessment = "request_changes";
    } else if (hasWarnings) {
        overallAssessment = "comment";
    } else {
        overallAssessment = "approve";
    }

    // AI Provider generation
    const prompt = `Perform an AI code review for ${targetFileSet.size} file(s).
Errors: ${comments.filter(c => c.severity === "error").length}
Warnings: ${comments.filter(c => c.severity === "warning").length}
Assessment: ${overallAssessment}`;

    const completion = await provider.generateCompletion(prompt);

    const summary = `${completion.text}\n\nReview concluded with ${comments.length} item(s) across ${targetFileSet.size} file(s).`;

    return {
        summary,
        overallAssessment,
        comments,
        risksIdentified,
        changedFilesCount: targetFileSet.size
    };
}
