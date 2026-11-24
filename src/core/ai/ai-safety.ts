import type { DiffSuggestion } from "./ai-types";

// Known injection pattern signatures
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|above)\s+instructions/gi,
    /disregard\s+all\s+(prior|previous)\s+prompts/gi,
    /system\s*:\s*you\s+are\s+now/gi,
    /\[inst\]\s*<<sys>>/gi,
    /<\|im_start\|>system/gi,
    /<\|endoftext\|>/gi
];

// Patterns for credential and secret redaction
const SECRET_PATTERNS = [
    /(['"]?(?:password|passwd|secret|token|api[_-]?key|access[_-]?token)['"]?\s*[:=]\s*['"])([^'"]{6,})(['"])/gi,
    /(AKIA[0-9A-Z]{16})/g,
    /(ghp_[a-zA-Z0-9]{36})/g,
    /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/g,
    /(-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----)/g
];

export function sanitizePrompt(text: string): string {
    let sanitized = text;
    for (const pattern of INJECTION_PATTERNS) {
        sanitized = sanitized.replace(pattern, "[FILTERED_PROMPT_INJECTION]");
    }
    return sanitized;
}

export function redactSecretsInContext(text: string): { sanitized: string; redactionCount: number } {
    let sanitized = text;
    let redactionCount = 0;

    for (const pattern of SECRET_PATTERNS) {
        sanitized = sanitized.replace(pattern, (match, p1, p2, p3) => {
            redactionCount++;
            if (p2 !== undefined && p3 !== undefined) {
                return `${p1}***REDACTED***${p3}`;
            }
            return "***REDACTED_SECRET***";
        });
    }

    return { sanitized, redactionCount };
}

export function validateDiffPatch(diff: DiffSuggestion): { safe: boolean; reason?: string } {
    const { filePath, modifiedContent } = diff;

    // 1. Must not escape target repository
    if (filePath.includes("..") || filePath.startsWith("/") && !filePath.startsWith("/src")) {
        return {
            safe: false,
            reason: "Path traversal detected: patch targets path outside repository boundaries."
        };
    }

    // 2. Reject code introducing dangerous dynamic execution sinks
    const dangerousPatterns = [
        /\beval\s*\(/,
        /\bchild_process\b.*\b(exec|execSync)\b/,
        /\bFunction\s*\(\s*['"][^'"]*['"]\s*\)\s*\(/
    ];

    for (const dp of dangerousPatterns) {
        if (dp.test(modifiedContent) && !dp.test(diff.originalContent)) {
            return {
                safe: false,
                reason: `Unsafe code introduction detected: newly introduced ${dp.source}`
            };
        }
    }

    return { safe: true };
}
