import ts from "typescript";
import { calculateShannonEntropy, redactSecret } from "../entropy";
import type { SecurityFinding, SecurityContext } from "../security-types";
import type { SourceLocation } from "../../parser/parser-types";

function getLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
    const start = node.getStart(sourceFile);
    const pos = sourceFile.getLineAndCharacterOfPosition(start);
    return {
        line: pos.line + 1,
        column: pos.character + 1,
        start,
        end: node.getEnd()
    };
}

const KNOWN_SECRET_PATTERNS = [
    {
        name: "AWS Access Key ID",
        pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
        ruleId: "SEC-SECRET-AWS",
        severity: "critical" as const,
        cwe: "CWE-798"
    },
    {
        name: "GitHub Token",
        pattern: /\b(gh[pousr]_[A-Za-z0-9_]{36,})\b/g,
        ruleId: "SEC-SECRET-GITHUB",
        severity: "critical" as const,
        cwe: "CWE-798"
    },
    {
        name: "OpenAI API Key",
        pattern: /\b(sk-[a-zA-Z0-9_-]{32,})\b/g,
        ruleId: "SEC-SECRET-OPENAI",
        severity: "critical" as const,
        cwe: "CWE-798"
    },
    {
        name: "Stripe Secret/Publishable Key",
        pattern: /\b((?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,})\b/g,
        ruleId: "SEC-SECRET-STRIPE",
        severity: "high" as const,
        cwe: "CWE-798"
    },
    {
        name: "Slack API Token",
        pattern: /\b(xox[baprs]-[0-9a-zA-Z]{10,})\b/g,
        ruleId: "SEC-SECRET-SLACK",
        severity: "high" as const,
        cwe: "CWE-798"
    },
    {
        name: "Database Connection String with Credentials",
        pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/([^:]+):([^@\s]+)@([a-zA-Z0-9_.-]+)/g,
        ruleId: "SEC-SECRET-DB-URI",
        severity: "critical" as const,
        cwe: "CWE-312"
    },
    {
        name: "Private Cryptographic Key",
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
        ruleId: "SEC-SECRET-PRIVATE-KEY",
        severity: "critical" as const,
        cwe: "CWE-312"
    }
];

const DEFAULT_ALLOWLIST = new Set([
    "password", "secret", "admin", "test", "example", "changeme",
    "placeholder", "dummy", "123456", "default", "none", "root",
    "mock", "fixture", "your_api_key_here", "xxx", "undefined", "null"
]);

const SENSITIVE_VAR_NAMES = /(password|passwd|secret|api_?key|auth_?token|access_?token|private_?key|jwt_?secret)$/i;

export function detectSecrets(context: SecurityContext): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const { filePath, content, sourceFile, allowlist } = context;

    const customAllowlist = new Set([
        ...DEFAULT_ALLOWLIST,
        ...(allowlist ?? []).map(s => s.toLowerCase())
    ]);

    // 1. Regex pattern scanning on raw source
    for (const rule of KNOWN_SECRET_PATTERNS) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = rule.pattern.exec(content)) !== null) {
            const rawSecret = match[0];
            const start = match.index;
            const pos = sourceFile.getLineAndCharacterOfPosition(start);
            const redacted = redactSecret(rawSecret);

            findings.push({
                id: `${rule.ruleId}:${filePath}:${pos.line + 1}`,
                ruleId: rule.ruleId,
                ruleName: rule.name,
                severity: rule.severity,
                category: "secret",
                confidence: "high",
                title: `Hardcoded ${rule.name}`,
                message: `Potentially exposed ${rule.name} detected in source code.`,
                filePath,
                location: {
                    line: pos.line + 1,
                    column: pos.character + 1,
                    start,
                    end: start + rawSecret.length
                },
                evidence: [
                    `Pattern matched: ${rule.name}`,
                    `Redacted secret: ${redacted}`
                ],
                remediation: "Store credentials in environment variables or a secure secret manager. Never commit secrets to source control.",
                cwe: rule.cwe,
                owasp: "A07:2021-Identification and Authentication Failures"
            });
        }
    }

    // 2. AST scanning for variable assignments with sensitive names and high entropy
    function visit(node: ts.Node): void {
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
            const varName = node.name.getText(sourceFile);
            const value = node.initializer.text;

            if (SENSITIVE_VAR_NAMES.test(varName)) {
                const lowerVal = value.toLowerCase().trim();
                const isAllowlisted = customAllowlist.has(lowerVal) || lowerVal.length < 8;

                if (!isAllowlisted) {
                    const entropy = calculateShannonEntropy(value);
                    const isHighEntropy = entropy >= 3.2 && value.length >= 10;
                    const confidence = isHighEntropy ? "high" : "medium";

                    findings.push({
                        id: `SEC-SECRET-HARDCODED-VAR:${filePath}:${node.getStart(sourceFile)}`,
                        ruleId: "SEC-SECRET-HARDCODED-VAR",
                        ruleName: "Hardcoded Credential Variable",
                        severity: "high",
                        category: "secret",
                        confidence,
                        title: `Hardcoded credential in variable '${varName}'`,
                        message: `Variable '${varName}' appears to hold a hardcoded secret with entropy ${entropy.toFixed(2)}.`,
                        filePath,
                        location: getLocation(node, sourceFile),
                        evidence: [
                            `Variable name: '${varName}'`,
                            `Entropy: ${entropy.toFixed(2)}`,
                            `Redacted value: ${redactSecret(value)}`
                        ],
                        remediation: `Extract '${varName}' to environment variable (process.env.${varName.toUpperCase()}).`,
                        cwe: "CWE-798",
                        owasp: "A07:2021-Identification and Authentication Failures"
                    });
                }
            }
        }

        // 3. JWT sign / verify with hardcoded string secret
        if (ts.isCallExpression(node)) {
            const calleeText = node.expression.getText(sourceFile);
            if (calleeText.endsWith(".sign") || calleeText.endsWith(".verify") || calleeText === "jwtSign" || calleeText === "jwtVerify") {
                // Typically argument 1 or 2 is the secret: jwt.sign(payload, "secret")
                for (let i = 1; i < node.arguments.length; i++) {
                    const arg = node.arguments[i]!;
                    if (ts.isStringLiteral(arg)) {
                        const secretVal = arg.text;
                        if (!customAllowlist.has(secretVal.toLowerCase()) || secretVal.length >= 6) {
                            findings.push({
                                id: `SEC-SECRET-JWT-HARDCODED:${filePath}:${arg.getStart(sourceFile)}`,
                                ruleId: "SEC-SECRET-JWT-HARDCODED",
                                ruleName: "Hardcoded JWT Secret",
                                severity: "critical",
                                category: "secret",
                                confidence: "high",
                                title: "Hardcoded secret in JWT call",
                                message: `JWT method '${calleeText}' uses a hardcoded secret string literal.`,
                                filePath,
                                location: getLocation(arg, sourceFile),
                                evidence: [
                                    `Method: ${calleeText}`,
                                    `Redacted secret: ${redactSecret(secretVal)}`
                                ],
                                remediation: "Pass JWT signing/verification secrets via environment variables (e.g. process.env.JWT_SECRET).",
                                cwe: "CWE-798",
                                owasp: "A02:2021-Cryptographic Failures"
                            });
                        }
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return findings;
}
