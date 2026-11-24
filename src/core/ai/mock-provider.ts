import type { ModelProvider, PromptContext, AIResponse } from "./ai-types";

export class MockModelProvider implements ModelProvider {
    public readonly name: string = "mock-codeops-ai";
    private customResponses: Map<string, string> = new Map();

    public setResponse(promptSubstring: string, responseText: string): void {
        this.customResponses.set(promptSubstring.toLowerCase(), responseText);
    }

    public async generateCompletion(prompt: string, context?: PromptContext): Promise<AIResponse> {
        const lowerPrompt = prompt.toLowerCase();

        // Check if there is a customized response
        for (const [key, val] of this.customResponses.entries()) {
            if (lowerPrompt.includes(key)) {
                return {
                    text: val,
                    model: this.name,
                    usage: {
                        promptTokens: Math.ceil(prompt.length / 4),
                        completionTokens: Math.ceil(val.length / 4)
                    }
                };
            }
        }

        // Heuristic responses for common static analysis tasks
        if (lowerPrompt.includes("explain finding") || lowerPrompt.includes("vulnerability") || lowerPrompt.includes("violation")) {
            const findingSnippet = context?.findings && context.findings.length > 0
                ? JSON.stringify(context.findings[0], null, 2)
                : "Finding Details";

            const reply = `### CodeOps Finding Analysis
**Root Cause Analysis:**
The identified finding represents a potential reliability or security flaw in the target file.
Based on the AST and call hierarchy:
1. The vulnerable/violating code is triggered during data handling or cross-layer communication.
2. Direct unvalidated input or architectural layer boundaries are breached.

**Impact Assessment:**
- Risk Level: High
- Blast Radius: Can propagate to downstream dependents identified in the dependency graph.

**Remediation Recommendation:**
Refactor the implementation to use sanitized inputs or follow proper layer encapsulation.
\`\`\`typescript
// Suggested Remediation:
// 1. Sanitize incoming variables before sink invocation
// 2. Introduce an intermediary service interface
\`\`\``;

            return {
                text: reply,
                model: this.name,
                usage: {
                    promptTokens: Math.ceil(prompt.length / 4),
                    completionTokens: Math.ceil(reply.length / 4)
                }
            };
        }

        if (lowerPrompt.includes("review") || lowerPrompt.includes("diff") || lowerPrompt.includes("changes")) {
            const reply = `### CodeOps Automated Code Review
**Summary:**
Reviewed modified files across security, architecture, and complexity dimensions.

**Findings & Observations:**
1. Code structure maintains standard conventions.
2. Ensure new methods have corresponding unit tests.
3. Check error handling on asynchronous operations.`;

            return {
                text: reply,
                model: this.name,
                usage: {
                    promptTokens: Math.ceil(prompt.length / 4),
                    completionTokens: Math.ceil(reply.length / 4)
                }
            };
        }

        const defaultReply = `CodeOps AI Analysis completed for prompt. Context files: ${context?.files?.length ?? 0}.`;
        return {
            text: defaultReply,
            model: this.name,
            usage: {
                promptTokens: Math.ceil(prompt.length / 4),
                completionTokens: Math.ceil(defaultReply.length / 4)
            }
        };
    }
}
