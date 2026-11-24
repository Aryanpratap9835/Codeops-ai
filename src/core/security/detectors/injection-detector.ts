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

const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|FROM|WHERE|JOIN)\b/i;

function isDynamicSqlExpression(expr: ts.Expression): boolean {
    // String concatenation with '+'
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        return true;
    }
    // Template literal with interpolated variables: `SELECT * FROM users WHERE id = ${id}`
    if (ts.isTemplateExpression(expr) && expr.templateSpans.length > 0) {
        return true;
    }
    return false;
}

export function detectInjections(context: SecurityContext): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const { filePath, sourceFile } = context;

    function visit(node: ts.Node): void {
        // 1. SQL Injection & Command Injection via Call Expressions
        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(sourceFile);

            // SQL Query execution methods
            const isSqlMethod =
                callee.endsWith(".query") ||
                callee.endsWith(".raw") ||
                callee.endsWith(".$queryRawUnsafe") ||
                callee.endsWith(".execute") ||
                callee === "query";

            if (isSqlMethod && node.arguments.length > 0) {
                const queryArg = node.arguments[0]!;
                const queryText = queryArg.getText(sourceFile);

                if (isDynamicSqlExpression(queryArg) && SQL_KEYWORDS.test(queryText)) {
                    findings.push({
                        id: `SEC-INJ-SQL:${filePath}:${node.getStart(sourceFile)}`,
                        ruleId: "SEC-INJ-SQL",
                        ruleName: "SQL Injection",
                        severity: "critical",
                        category: "injection",
                        confidence: "high",
                        title: "Potential SQL injection via dynamic query string",
                        message: `Dynamic string concatenation or interpolation in SQL query via '${callee}'.`,
                        filePath,
                        location: getLocation(node, sourceFile),
                        evidence: [
                            `Callee: ${callee}`,
                            `Expression: ${queryText.slice(0, 100)}`
                        ],
                        remediation: "Use parameterized queries (e.g. 'SELECT * FROM users WHERE id = $1', [userId]) or ORM query builders.",
                        cwe: "CWE-89",
                        owasp: "A03:2021-Injection",
                        snippet: queryText.slice(0, 120)
                    });
                }
            }

            // Command Injection: child_process.exec, execSync, spawn
            const isExecMethod =
                callee === "exec" ||
                callee === "execSync" ||
                callee.endsWith(".exec") ||
                callee.endsWith(".execSync");

            if (isExecMethod && node.arguments.length > 0) {
                const cmdArg = node.arguments[0]!;
                const cmdText = cmdArg.getText(sourceFile);

                if (isDynamicSqlExpression(cmdArg)) {
                    findings.push({
                        id: `SEC-INJ-CMD:${filePath}:${node.getStart(sourceFile)}`,
                        ruleId: "SEC-INJ-CMD",
                        ruleName: "Command Injection",
                        severity: "critical",
                        category: "injection",
                        confidence: "high",
                        title: "Potential command injection in system shell execution",
                        message: `Dynamic string passed to '${callee}' enables arbitrary command execution if input contains shell metacharacters.`,
                        filePath,
                        location: getLocation(node, sourceFile),
                        evidence: [
                            `Execution method: ${callee}`,
                            `Command expression: ${cmdText.slice(0, 100)}`
                        ],
                        remediation: "Use 'execFile' or 'spawn' with an array of arguments rather than shell interpolation.",
                        cwe: "CWE-78",
                        owasp: "A03:2021-Injection"
                    });
                }
            }

            // Path Traversal: fs.readFile, fs.createReadStream with dynamic path
            const isFsMethod =
                callee.endsWith("readFile") ||
                callee.endsWith("readFileSync") ||
                callee.endsWith("createReadStream") ||
                callee.endsWith("writeFile") ||
                callee.endsWith("writeFileSync") ||
                callee.endsWith("unlink") ||
                callee.endsWith("unlinkSync");

            if (isFsMethod && node.arguments.length > 0) {
                const pathArg = node.arguments[0]!;
                const pathText = pathArg.getText(sourceFile);

                // Check if path argument accesses request params or unsanitized concatenation
                if (
                    pathText.includes("req.params") ||
                    pathText.includes("req.query") ||
                    pathText.includes("req.body")
                ) {
                    findings.push({
                        id: `SEC-INJ-PATH-TRAVERSAL:${filePath}:${node.getStart(sourceFile)}`,
                        ruleId: "SEC-INJ-PATH-TRAVERSAL",
                        ruleName: "Path Traversal",
                        severity: "high",
                        category: "traversal",
                        confidence: "high",
                        title: "Potential Path Traversal in filesystem operation",
                        message: `User-controlled request data is passed to '${callee}' without path validation.`,
                        filePath,
                        location: getLocation(node, sourceFile),
                        evidence: [
                            `Filesystem method: ${callee}`,
                            `Path expression: ${pathText.slice(0, 80)}`
                        ],
                        remediation: "Use 'path.basename()' or verify that resolved path starts with an allowed base directory using 'path.resolve()'.",
                        cwe: "CWE-22",
                        owasp: "A01:2021-Broken Access Control"
                    });
                }
            }
        }

        // 2. XSS: innerHTML / outerHTML assignment or React dangerouslySetInnerHTML
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const leftText = node.left.getText(sourceFile);
            if (leftText.endsWith(".innerHTML") || leftText.endsWith(".outerHTML")) {
                const rightText = node.right.getText(sourceFile);
                if (!ts.isStringLiteral(node.right)) {
                    findings.push({
                        id: `SEC-INJ-XSS-DOM:${filePath}:${node.getStart(sourceFile)}`,
                        ruleId: "SEC-INJ-XSS-DOM",
                        ruleName: "DOM-Based Cross-Site Scripting (XSS)",
                        severity: "high",
                        category: "injection",
                        confidence: "high",
                        title: "Unsafe innerHTML assignment",
                        message: `Direct assignment of dynamic value to '${leftText}' may permit XSS.`,
                        filePath,
                        location: getLocation(node, sourceFile),
                        evidence: [
                            `Target property: ${leftText}`,
                            `Assigned expression: ${rightText.slice(0, 80)}`
                        ],
                        remediation: "Use 'textContent' or sanitize HTML with DOMPurify before assignment.",
                        cwe: "CWE-79",
                        owasp: "A03:2021-Injection"
                    });
                }
            }
        }

        // React dangerouslySetInnerHTML attribute
        if (ts.isJsxAttribute(node) && (ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile)) === "dangerouslySetInnerHTML") {
            findings.push({
                id: `SEC-INJ-XSS-REACT:${filePath}:${node.getStart(sourceFile)}`,
                ruleId: "SEC-INJ-XSS-REACT",
                ruleName: "Cross-Site Scripting via dangerouslySetInnerHTML",
                severity: "high",
                category: "injection",
                confidence: "high",
                title: "Use of dangerouslySetInnerHTML in JSX",
                message: "dangerouslySetInnerHTML renders unescaped HTML, creating XSS vulnerability if input is untrusted.",
                filePath,
                location: getLocation(node, sourceFile),
                evidence: [
                    `JSX Attribute: dangerouslySetInnerHTML`,
                    `Element: ${node.parent.parent.getText(sourceFile).slice(0, 60)}`
                ],
                remediation: "Sanitize the HTML using a library like DOMPurify or render standard React text children.",
                cwe: "CWE-79",
                owasp: "A03:2021-Injection"
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
}
