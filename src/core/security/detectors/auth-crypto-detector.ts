import ts from "typescript";
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

export function detectAuthAndCrypto(context: SecurityContext): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const { filePath, sourceFile } = context;

    function visit(node: ts.Node): void {
        // 1. Weak cryptographic hashing (MD5, SHA1)
        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(sourceFile);

            if (callee.endsWith("createHash") && node.arguments.length > 0) {
                const arg = node.arguments[0]!;
                if (ts.isStringLiteral(arg)) {
                    const algo = arg.text.toLowerCase();
                    if (algo === "md5" || algo === "sha1") {
                        findings.push({
                            id: `SEC-CRYPTO-WEAK-HASH:${filePath}:${node.getStart(sourceFile)}`,
                            ruleId: "SEC-CRYPTO-WEAK-HASH",
                            ruleName: "Weak Cryptographic Hash",
                            severity: "high",
                            category: "crypto",
                            confidence: "high",
                            title: `Use of broken cryptographic hash '${algo.toUpperCase()}'`,
                            message: `${algo.toUpperCase()} is cryptographically broken and vulnerable to collision attacks.`,
                            filePath,
                            location: getLocation(node, sourceFile),
                            evidence: [
                                `Algorithm: ${algo}`,
                                `Call: ${node.getText(sourceFile)}`
                            ],
                            remediation: "Use SHA-256 (SHA-2) or SHA-3 for general hashing, or Argon2/bcrypt/PBKDF2 for password storage.",
                            cwe: "CWE-328",
                            owasp: "A02:2021-Cryptographic Failures"
                        });
                    }
                }
            }

            // Insecure random numbers in token or security contexts
            if (callee === "Math.random" || callee.endsWith(".Math.random")) {
                const parentText = node.parent.getText(sourceFile).toLowerCase();
                const isSecurityContext =
                    parentText.includes("token") ||
                    parentText.includes("secret") ||
                    parentText.includes("key") ||
                    parentText.includes("salt") ||
                    parentText.includes("session");

                if (isSecurityContext) {
                    findings.push({
                        id: `SEC-CRYPTO-INSECURE-RANDOM:${filePath}:${node.getStart(sourceFile)}`,
                        ruleId: "SEC-CRYPTO-INSECURE-RANDOM",
                        ruleName: "Insecure Randomness for Security Context",
                        severity: "medium",
                        category: "crypto",
                        confidence: "medium",
                        title: "Math.random() used in security-sensitive context",
                        message: "Math.random() is pseudorandom and cryptographically insecure; values can be predicted.",
                        filePath,
                        location: getLocation(node, sourceFile),
                        evidence: [
                            `Expression: ${node.parent.getText(sourceFile).slice(0, 80)}`
                        ],
                        remediation: "Use 'crypto.randomBytes()' or 'crypto.getRandomValues()' for security-critical values.",
                        cwe: "CWE-338",
                        owasp: "A02:2021-Cryptographic Failures"
                    });
                }
            }
        }

        // 2. Insecure TLS / HTTPS (rejectUnauthorized: false)
        if (ts.isPropertyAssignment(node)) {
            const propName = node.name.getText(sourceFile);
            if (propName === "rejectUnauthorized" && node.initializer.kind === ts.SyntaxKind.FalseKeyword) {
                findings.push({
                    id: `SEC-CRYPTO-INSECURE-TLS:${filePath}:${node.getStart(sourceFile)}`,
                    ruleId: "SEC-CRYPTO-INSECURE-TLS",
                    ruleName: "Disabled TLS Certificate Verification",
                    severity: "critical",
                    category: "crypto",
                    confidence: "high",
                    title: "TLS certificate validation disabled (rejectUnauthorized: false)",
                    message: "Disabling TLS certificate verification allows Man-In-The-Middle (MITM) attacks.",
                    filePath,
                    location: getLocation(node, sourceFile),
                    evidence: [
                        `Property assignment: rejectUnauthorized: false`
                    ],
                    remediation: "Remove 'rejectUnauthorized: false' and install the proper CA certificate chain.",
                    cwe: "CWE-295",
                    owasp: "A02:2021-Cryptographic Failures"
                });
            }

            // Insecure JWT verification: algorithms: ['none'] or ignoreExpiration: true
            if (propName === "algorithms" && ts.isArrayLiteralExpression(node.initializer)) {
                for (const element of node.initializer.elements) {
                    if (ts.isStringLiteral(element) && element.text.toLowerCase() === "none") {
                        findings.push({
                            id: `SEC-AUTH-JWT-NONE-ALGO:${filePath}:${node.getStart(sourceFile)}`,
                            ruleId: "SEC-AUTH-JWT-NONE-ALGO",
                            ruleName: "JWT 'none' Algorithm Allowed",
                            severity: "critical",
                            category: "auth",
                            confidence: "high",
                            title: "JWT allows 'none' algorithm",
                            message: "Accepting algorithm 'none' permits attackers to forge unsigned JWT tokens.",
                            filePath,
                            location: getLocation(node, sourceFile),
                            evidence: [
                                `Allowed algorithms: ${node.initializer.getText(sourceFile)}`
                            ],
                            remediation: "Explicitly require secure algorithms such as ['HS256', 'RS256'].",
                            cwe: "CWE-347",
                            owasp: "A07:2021-Identification and Authentication Failures"
                        });
                    }
                }
            }

            if (propName === "ignoreExpiration" && node.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                findings.push({
                    id: `SEC-AUTH-JWT-IGNORE-EXP:${filePath}:${node.getStart(sourceFile)}`,
                    ruleId: "SEC-AUTH-JWT-IGNORE-EXP",
                    ruleName: "JWT Expiration Ignored",
                    severity: "medium",
                    category: "auth",
                    confidence: "high",
                    title: "JWT verification ignores token expiration",
                    message: "Configuring ignoreExpiration: true permits expired tokens to be accepted indefinitely.",
                    filePath,
                    location: getLocation(node, sourceFile),
                    evidence: [
                        `ignoreExpiration: true`
                    ],
                    remediation: "Ensure token expiration is enforced (remove ignoreExpiration: true).",
                    cwe: "CWE-613",
                    owasp: "A07:2021-Identification and Authentication Failures"
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
}
