export interface FileContext {
    path: string;
    content: string;
    startLine?: number;
    endLine?: number;
}

export interface PromptContext {
    systemPrompt?: string;
    files?: FileContext[];
    findings?: unknown[];
    callGraphSnippets?: string[];
    tokenLimit?: number;
}

export interface AIResponse {
    text: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

export interface ModelProvider {
    name: string;
    generateCompletion(prompt: string, context?: PromptContext): Promise<AIResponse>;
}

export interface DiffSuggestion {
    filePath: string;
    originalContent: string;
    modifiedContent: string;
    unifiedDiff: string;
    rationale: string;
    safetyApproved: boolean;
    safetyNotes?: string[];
}

export interface ReviewComment {
    filePath: string;
    line?: number;
    severity: "info" | "warning" | "error";
    message: string;
    suggestion?: string;
    ruleId?: string;
}

export interface ReviewResult {
    summary: string;
    overallAssessment: "approve" | "request_changes" | "comment";
    comments: ReviewComment[];
    risksIdentified: string[];
    changedFilesCount: number;
}
