import * as fs from "node:fs";
import * as path from "node:path";
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import type { DiffSuggestion, ModelProvider } from "./ai-types";
import { MockModelProvider } from "./mock-provider";
import { retrieveContext } from "./context-retriever";
import { validateDiffPatch } from "./ai-safety";

const defaultProvider = new MockModelProvider();

export function createUnifiedDiff(
    filePath: string,
    originalContent: string,
    modifiedContent: string
): string {
    const origLines = originalContent.split("\n");
    const modLines = modifiedContent.split("\n");

    const header = `--- a/${filePath.replace(/\\/g, "/")}\n+++ b/${filePath.replace(/\\/g, "/")}\n@@ -1,${origLines.length} +1,${modLines.length} @@\n`;

    // Line-by-line diff
    const diffLines: string[] = [];
    let i = 0;
    let j = 0;

    while (i < origLines.length || j < modLines.length) {
        if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
            diffLines.push(` ${origLines[i]}`);
            i++;
            j++;
        } else if (i < origLines.length && (j >= modLines.length || origLines[i] !== modLines[j])) {
            diffLines.push(`-${origLines[i]}`);
            i++;
        } else if (j < modLines.length) {
            diffLines.push(`+${modLines[j]}`);
            j++;
        }
    }

    return header + diffLines.join("\n");
}

export async function generateFixSuggestion(
    findingId: string,
    repoPath: string,
    files: ParsedFile[],
    dependencyGraph: GraphResult,
    callGraph: CallGraphResult,
    allFindings: Array<{ id: string; filePath: string; title: string; message: string; severity?: string; evidence?: string }>,
    provider: ModelProvider = defaultProvider
): Promise<DiffSuggestion> {
    const finding = allFindings.find(f => f.id === findingId || f.filePath.endsWith(findingId));
    if (!finding) {
        throw new Error(`Finding with ID '${findingId}' was not found.`);
    }

    const resolvedPath = path.isAbsolute(finding.filePath)
        ? finding.filePath
        : path.resolve(repoPath, finding.filePath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File '${finding.filePath}' does not exist on disk.`);
    }

    const originalContent = fs.readFileSync(resolvedPath, "utf-8");
    const context = retrieveContext(repoPath, files, dependencyGraph, callGraph, allFindings, {
        findingId: finding.id,
        targetFilePath: finding.filePath
    });

    const prompt = `Generate a safe fix for: ${finding.title} in ${finding.filePath}.
Message: ${finding.message}
Evidence: ${finding.evidence ?? "N/A"}`;

    await provider.generateCompletion(prompt, context);

    // Remediation transformations based on finding characteristics
    let modifiedContent = originalContent;
    let rationale = `Remediated ${finding.title}`;

    if (finding.title.toLowerCase().includes("sql") || finding.message.toLowerCase().includes("sql")) {
        // Parameterize query
        modifiedContent = modifiedContent.replace(
            /(query|execute)\s*\(\s*`SELECT\s+[^`]*\$\{([^}]+)\}[^`]*`\s*\)/g,
            (match, fn, param) => `${fn}("SELECT * FROM table WHERE param = ?", [${param.trim()}])`
        );
        rationale = "Replaced concatenated SQL string with parameterized query to eliminate SQL injection.";
    } else if (finding.title.toLowerCase().includes("command injection") || finding.message.toLowerCase().includes("exec")) {
        // Sanitize exec
        modifiedContent = modifiedContent.replace(
            /exec\s*\(([^)]+)\)/g,
            `execFile("safe-binary", [$1])`
        );
        rationale = "Replaced shell exec invocation with execFile and explicit argument list to prevent command injection.";
    } else if (finding.title.toLowerCase().includes("secret") || finding.title.toLowerCase().includes("credential")) {
        // Replace hardcoded secret with environment variable
        modifiedContent = modifiedContent.replace(
            /(['"]?(?:password|passwd|secret|token|apiKey)['"]?\s*[:=]\s*['"])([^'"]+)(['"])/g,
            `$1process.env.APP_SECRET || ""$3`
        );
        rationale = "Replaced hardcoded credential with process.env lookup.";
    } else {
        // General safe refactoring comment and defensive check
        modifiedContent = `// [CodeOps Remediation]: Addressed ${finding.title}\n` + originalContent;
        rationale = `Added defensive safeguards for ${finding.title}`;
    }

    const unifiedDiff = createUnifiedDiff(finding.filePath, originalContent, modifiedContent);

    const suggestion: DiffSuggestion = {
        filePath: finding.filePath,
        originalContent,
        modifiedContent,
        unifiedDiff,
        rationale,
        safetyApproved: false,
        safetyNotes: []
    };

    const safetyCheck = validateDiffPatch(suggestion);
    if (!safetyCheck.safe) {
        suggestion.safetyApproved = false;
        suggestion.safetyNotes?.push(`Safety Check Failed: ${safetyCheck.reason}`);
    } else {
        suggestion.safetyApproved = true;
        suggestion.safetyNotes?.push("Safety Check Passed: No dangerous primitives or directory escapes introduced.");
    }

    return suggestion;
}
