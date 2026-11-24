import * as fs from "node:fs";
import * as path from "node:path";
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult, CallGraphEdge } from "../call-graph/call-graph-types";
import type { PromptContext, FileContext } from "./ai-types";
import { redactSecretsInContext, sanitizePrompt } from "./ai-safety";

export interface ContextRetrievalOptions {
    targetFilePath?: string;
    findingId?: string;
    tokenLimit?: number; // approx 4 chars per token
    includeCallGraphSnippets?: boolean;
}

export function retrieveContext(
    repoPath: string,
    files: ParsedFile[],
    dependencyGraph: GraphResult,
    callGraph: CallGraphResult,
    allFindings: Array<{ id: string; filePath: string; title: string; message: string; severity?: string; evidence?: string }>,
    options: ContextRetrievalOptions = {}
): PromptContext {
    const tokenLimit = options.tokenLimit ?? 4000;
    const maxChars = tokenLimit * 4;
    let currentChars = 0;

    const matchedFindings = allFindings.filter(f => {
        if (options.findingId && f.id === options.findingId) return true;
        if (options.targetFilePath) {
            const normTarget = options.targetFilePath.replace(/\\/g, "/");
            const normF = f.filePath.replace(/\\/g, "/");
            return normF === normTarget || normF.endsWith(normTarget);
        }
        return false;
    });

    const targetFiles = new Set<string>();
    if (options.targetFilePath) {
        targetFiles.add(options.targetFilePath);
    }
    for (const f of matchedFindings) {
        targetFiles.add(f.filePath);
    }

    const contextFiles: FileContext[] = [];

    // Collect file contents
    for (const tf of targetFiles) {
        if (currentChars >= maxChars) break;

        let resolvedPath = path.isAbsolute(tf) ? tf : path.resolve(repoPath, tf);
        if (!fs.existsSync(resolvedPath)) {
            // Fuzzy match against scanned repository files
            const normTf = tf.replace(/\\/g, "/");
            const matched = files.find(f => {
                const normF = f.filePath.replace(/\\/g, "/");
                return normF === normTf || normF.endsWith(normTf);
            });
            if (matched) {
                resolvedPath = path.isAbsolute(matched.filePath) ? matched.filePath : path.resolve(repoPath, matched.filePath);
            }
        }

        if (fs.existsSync(resolvedPath)) {
            try {
                let content = fs.readFileSync(resolvedPath, "utf-8");
                // Sanitize prompt injection attempts and redact secrets
                content = sanitizePrompt(content);
                const { sanitized } = redactSecretsInContext(content);
                content = sanitized;

                // Truncate if exceeds remaining capacity
                const remaining = maxChars - currentChars;
                if (content.length > remaining) {
                    content = content.slice(0, remaining) + "\n// ... [truncated for context limit]";
                }

                currentChars += content.length;
                contextFiles.push({
                    path: tf,
                    content
                });
            } catch {
                // Ignore unreadable files
            }
        }
    }

    // Call graph snippets
    const callGraphSnippets: string[] = [];
    if (options.includeCallGraphSnippets !== false && currentChars < maxChars) {
        for (const tf of targetFiles) {
            const norm = tf.replace(/\\/g, "/");
            const relevantCalls = callGraph.edges.filter((e: CallGraphEdge) => {
                const s = e.filePath ? e.filePath.replace(/\\/g, "/") : "";
                return s.endsWith(norm);
            });

            for (const edge of relevantCalls.slice(0, 10)) {
                const snippet = `Call in ${edge.filePath}: callee='${edge.callee}' (kind=${edge.calleeKind}, resolution=${edge.resolution})`;
                callGraphSnippets.push(snippet);
                currentChars += snippet.length;
            }
        }
    }

    return {
        files: contextFiles,
        findings: matchedFindings,
        callGraphSnippets,
        tokenLimit
    };
}
