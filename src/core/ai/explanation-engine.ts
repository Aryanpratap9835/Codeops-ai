import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import type { ModelProvider } from "./ai-types";
import { MockModelProvider } from "./mock-provider";
import { retrieveContext } from "./context-retriever";
import type { ArchitectureReport } from "../architecture/architecture-types";

const defaultProvider = new MockModelProvider();

export async function explainFinding(
    findingId: string,
    repoPath: string,
    files: ParsedFile[],
    dependencyGraph: GraphResult,
    callGraph: CallGraphResult,
    allFindings: Array<{ id: string; filePath: string; title: string; message: string; severity?: string; evidence?: string }>,
    provider: ModelProvider = defaultProvider
): Promise<{ finding: unknown; explanation: string; model: string }> {
    const finding = allFindings.find(f => f.id === findingId || f.filePath.endsWith(findingId));
    if (!finding) {
        throw new Error(`Finding with ID or path '${findingId}' was not found in repository findings.`);
    }

    const context = retrieveContext(repoPath, files, dependencyGraph, callGraph, allFindings, {
        findingId: finding.id,
        targetFilePath: finding.filePath
    });

    const prompt = `Please explain finding ${finding.id} ("${finding.title}") in ${finding.filePath}.
Message: ${finding.message}
Evidence: ${finding.evidence ?? "N/A"}

Provide:
1. Root cause explanation based on the code context.
2. How this issue can be exploited or cause a malfunction.
3. Concrete steps to fix it safely.`;

    const response = await provider.generateCompletion(prompt, context);

    return {
        finding,
        explanation: response.text,
        model: response.model
    };
}

export async function explainArchitecture(
    archReport: ArchitectureReport,
    provider: ModelProvider = defaultProvider
): Promise<string> {
    const layerNames = archReport.layers.map(l => `${l.layer} (${l.files.length} files)`).join(", ");
    const prompt = `Explain the following repository architecture:
Detected Layers: ${layerNames}
Cross-layer dependency issues: ${archReport.organizationIssues.length}
Unclassified files: ${archReport.unclassifiedFiles.length}

Provide a concise breakdown of architectural integrity and coupling.`;

    const response = await provider.generateCompletion(prompt);
    return response.text;
}
