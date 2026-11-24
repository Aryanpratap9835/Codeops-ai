import type { SarifLog, SarifRule, SarifResult } from "./workflow-types";
import type { SecurityFinding, SecuritySeverity } from "../security/security-types";
import type { AnalysisFinding, FindingSeverity } from "../analyzer/analysis-types";

function mapSeverityToSarifLevel(sev: SecuritySeverity | FindingSeverity): "error" | "warning" | "note" {
    switch (sev) {
        case "critical":
        case "high":
            return "error";
        case "medium":
            return "warning";
        case "low":
        case "info":
        default:
            return "note";
    }
}

export function exportToSarif(options: {
    securityFindings?: SecurityFinding[];
    analysisFindings?: AnalysisFinding[];
    toolVersion?: string;
}): SarifLog {
    const toolVersion = options.toolVersion ?? "1.0.0";
    const rulesMap = new Map<string, SarifRule>();
    const results: SarifResult[] = [];

    // 1. Security findings
    for (const sf of options.securityFindings ?? []) {
        if (!rulesMap.has(sf.ruleId)) {
            rulesMap.set(sf.ruleId, {
                id: sf.ruleId,
                name: sf.ruleName,
                shortDescription: { text: sf.title },
                fullDescription: { text: sf.message },
                defaultConfiguration: {
                    level: mapSeverityToSarifLevel(sf.severity)
                },
                helpUri: sf.cwe ? `https://cwe.mitre.org/data/definitions/${sf.cwe.replace("CWE-", "")}.html` : undefined,
                properties: {
                    category: sf.category,
                    confidence: sf.confidence,
                    remediation: sf.remediation
                }
            });
        }

        results.push({
            ruleId: sf.ruleId,
            level: mapSeverityToSarifLevel(sf.severity),
            message: { text: sf.message },
            locations: sf.location ? [
                {
                    physicalLocation: {
                        artifactLocation: {
                            uri: sf.filePath.replace(/\\/g, "/")
                        },
                        region: {
                            startLine: sf.location.line,
                            startColumn: sf.location.column,
                            endLine: sf.location.line,
                            endColumn: sf.location.column
                        }
                    }
                }
            ] : []
        });
    }

    // 2. Static analysis findings
    for (const af of options.analysisFindings ?? []) {
        if (!rulesMap.has(af.ruleId)) {
            rulesMap.set(af.ruleId, {
                id: af.ruleId,
                name: af.title,
                shortDescription: { text: af.title },
                fullDescription: { text: af.message },
                defaultConfiguration: {
                    level: mapSeverityToSarifLevel(af.severity)
                }
            });
        }

        results.push({
            ruleId: af.ruleId,
            level: mapSeverityToSarifLevel(af.severity),
            message: { text: af.message },
            locations: af.filePath ? [
                {
                    physicalLocation: {
                        artifactLocation: {
                            uri: af.filePath.replace(/\\/g, "/")
                        },
                        region: {
                            startLine: af.location?.line ?? 1,
                            startColumn: af.location?.column ?? 1
                        }
                    }
                }
            ] : []
        });
    }

    return {
        $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [
            {
                tool: {
                    driver: {
                        name: "CodeOps",
                        version: toolVersion,
                        informationUri: "https://github.com/Aryanpratap9835/Codeops-ai",
                        rules: [...rulesMap.values()]
                    }
                },
                results
            }
        ]
    };
}
