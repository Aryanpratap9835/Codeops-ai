import { describe, it, expect } from "vitest";
import { analyzeSecurityForFile, analyzeSecurity, computeSecurityScore } from "../../src/core/security/security-engine";
import { executeCommand } from "../../src/cli/cli-runner";

describe("Milestone 4 — Security Intelligence Engine", () => {
    describe("1. Secret Detection", () => {
        it("detects and redacts AWS access keys", () => {
            const code = `const awsKey = "AKIAIOSFODNN7EXAMPLE";`;
            const findings = analyzeSecurityForFile("src/aws.ts", code);

            const awsFinding = findings.find(f => f.ruleId === "SEC-SECRET-AWS");
            expect(awsFinding).toBeDefined();
            expect(awsFinding?.severity).toBe("critical");
            expect(awsFinding?.category).toBe("secret");

            // Verify full secret is NOT exposed in findings
            for (const ev of awsFinding!.evidence) {
                expect(ev).not.toContain("AKIAIOSFODNN7EXAMPLE");
            }
            expect(awsFinding!.evidence.some(ev => ev.includes("***"))).toBe(true);
        });

        it("detects and redacts OpenAI API keys", () => {
            const code = `const openai = "sk-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF";`;
            const findings = analyzeSecurityForFile("src/ai.ts", code);

            const openAiFinding = findings.find(f => f.ruleId === "SEC-SECRET-OPENAI");
            expect(openAiFinding).toBeDefined();
            expect(openAiFinding?.severity).toBe("critical");
        });

        it("detects database connection strings with credentials and redacts them", () => {
            const code = `const uri = "postgres://root:p@ssw0rd123!@db.internal:5432/production";`;
            const findings = analyzeSecurityForFile("src/db.ts", code);

            const dbFinding = findings.find(f => f.ruleId === "SEC-SECRET-DB-URI");
            expect(dbFinding).toBeDefined();
            expect(dbFinding?.severity).toBe("critical");
            expect(dbFinding?.evidence.join(" ")).toContain("***");
        });

        it("detects hardcoded JWT secret literals in jwt.sign calls", () => {
            const code = `import jwt from "jsonwebtoken"; jwt.sign({ sub: 1 }, "super-secret-jwt-key");`;
            const findings = analyzeSecurityForFile("src/auth.ts", code);

            const jwtFinding = findings.find(f => f.ruleId === "SEC-SECRET-JWT-HARDCODED");
            expect(jwtFinding).toBeDefined();
            expect(jwtFinding?.severity).toBe("critical");
        });

        it("does not report allowlisted / common placeholder values", () => {
            const code = `
                const password = "password";
                const testSecret = "test";
                const placeholder = "example";
            `;
            const findings = analyzeSecurityForFile("src/config.ts", code);
            expect(findings.length).toBe(0);
        });
    });

    describe("2. Injection Vulnerabilities", () => {
        it("detects SQL injection via string concatenation", () => {
            const code = `
                function getUser(req: any) {
                    db.query("SELECT * FROM users WHERE id = '" + req.params.id + "'");
                }
            `;
            const findings = analyzeSecurityForFile("src/user.ts", code);

            const sqliFinding = findings.find(f => f.ruleId === "SEC-INJ-SQL");
            expect(sqliFinding).toBeDefined();
            expect(sqliFinding?.severity).toBe("critical");
            expect(sqliFinding?.cwe).toBe("CWE-89");
        });

        it("detects SQL injection via dynamic template literals", () => {
            const code = `
                function findUser(name: string) {
                    client.query(\`SELECT * FROM accounts WHERE name = '\${name}'\`);
                }
            `;
            const findings = analyzeSecurityForFile("src/account.ts", code);

            const sqliFinding = findings.find(f => f.ruleId === "SEC-INJ-SQL");
            expect(sqliFinding).toBeDefined();
        });

        it("does not flag parameterized SQL queries as SQL injection", () => {
            const code = `
                function getUser(id: string) {
                    db.query("SELECT * FROM users WHERE id = $1", [id]);
                }
            `;
            const findings = analyzeSecurityForFile("src/safe.ts", code);
            const sqliFinding = findings.find(f => f.ruleId === "SEC-INJ-SQL");
            expect(sqliFinding).toBeUndefined();
        });

        it("detects command injection in child_process.exec", () => {
            const code = `
                import { exec } from "child_process";
                function pingHost(host: string) {
                    exec("ping -c 1 " + host);
                }
            `;
            const findings = analyzeSecurityForFile("src/ping.ts", code);

            const cmdFinding = findings.find(f => f.ruleId === "SEC-INJ-CMD");
            expect(cmdFinding).toBeDefined();
            expect(cmdFinding?.severity).toBe("critical");
            expect(cmdFinding?.cwe).toBe("CWE-78");
        });

        it("detects DOM XSS via innerHTML assignment", () => {
            const code = `
                function render(userInput: string) {
                    document.getElementById("output").innerHTML = userInput;
                }
            `;
            const findings = analyzeSecurityForFile("src/render.ts", code);

            const xssFinding = findings.find(f => f.ruleId === "SEC-INJ-XSS-DOM");
            expect(xssFinding).toBeDefined();
            expect(xssFinding?.severity).toBe("high");
        });

        it("detects React XSS via dangerouslySetInnerHTML", () => {
            const code = `
                export function Widget({ content }: { content: string }) {
                    return <div dangerouslySetInnerHTML={{ __html: content }} />;
                }
            `;
            const findings = analyzeSecurityForFile("src/Widget.tsx", code);

            const reactXss = findings.find(f => f.ruleId === "SEC-INJ-XSS-REACT");
            expect(reactXss).toBeDefined();
            expect(reactXss?.severity).toBe("high");
        });

        it("detects path traversal when request inputs are passed to filesystem calls", () => {
            const code = `
                import fs from "node:fs";
                function serveFile(req: any) {
                    return fs.readFileSync(req.params.fileName);
                }
            `;
            const findings = analyzeSecurityForFile("src/files.ts", code);

            const pathFinding = findings.find(f => f.ruleId === "SEC-INJ-PATH-TRAVERSAL");
            expect(pathFinding).toBeDefined();
            expect(pathFinding?.category).toBe("traversal");
            expect(pathFinding?.cwe).toBe("CWE-22");
        });
    });

    describe("3. Authentication and Cryptography", () => {
        it("detects broken hash algorithms (MD5 and SHA1)", () => {
            const code = `
                import crypto from "node:crypto";
                const hash1 = crypto.createHash("md5").update("data").digest("hex");
                const hash2 = crypto.createHash("sha1").update("data").digest("hex");
            `;
            const findings = analyzeSecurityForFile("src/hash.ts", code);

            const md5Finding = findings.find(f => f.evidence.some(e => e.includes("md5")));
            const sha1Finding = findings.find(f => f.evidence.some(e => e.includes("sha1")));

            expect(md5Finding).toBeDefined();
            expect(sha1Finding).toBeDefined();
            expect(md5Finding?.severity).toBe("high");
        });

        it("detects disabled TLS certificate validation", () => {
            const code = `
                import https from "node:https";
                const agent = new https.Agent({ rejectUnauthorized: false });
            `;
            const findings = analyzeSecurityForFile("src/client.ts", code);

            const tlsFinding = findings.find(f => f.ruleId === "SEC-CRYPTO-INSECURE-TLS");
            expect(tlsFinding).toBeDefined();
            expect(tlsFinding?.severity).toBe("critical");
        });

        it("detects JWT verification configured with 'none' algorithm", () => {
            const code = `
                import jwt from "jsonwebtoken";
                jwt.verify(token, key, { algorithms: ["none"] });
            `;
            const findings = analyzeSecurityForFile("src/jwt.ts", code);

            const jwtFinding = findings.find(f => f.ruleId === "SEC-AUTH-JWT-NONE-ALGO");
            expect(jwtFinding).toBeDefined();
            expect(jwtFinding?.severity).toBe("critical");
        });
    });

    describe("4. Security Scoring & CLI", () => {
        it("computes transparent security score and grade based on findings", () => {
            const cleanScore = computeSecurityScore([]);
            expect(cleanScore.score).toBe(100);
            expect(cleanScore.grade).toBe("A");

            const findings = analyzeSecurityForFile("src/vuln.ts", `
                const key = "AKIA1234567890ABCDEF";
                db.query("SELECT * FROM x WHERE id = " + input);
            `);

            const scoreReport = computeSecurityScore(findings);
            expect(scoreReport.score).toBeLessThanOrEqual(60);
            expect(scoreReport.severityDistribution.critical).toBeGreaterThanOrEqual(1);
        });

        it("executes codeops security CLI command cleanly", async () => {
            const exitCode = await executeCommand(["security", "./test-repo", "--json"]);
            expect(exitCode).toBe(0);
        });
    });
});
