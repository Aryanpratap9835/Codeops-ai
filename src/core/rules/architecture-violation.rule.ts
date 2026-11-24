import type { AnalysisFinding, FindingSeverity } from "../analyzer/analysis-types";
import type { RuleContext, AnalysisRule } from "./rule-engine";
import type { ArchitecturalLayer } from "../architecture/architecture-types";
import { classifyFile } from "../architecture/architecture-detector";

export interface ArchitectureConstraint {
    id: string;
    sourceLayer: ArchitecturalLayer | "*";
    forbiddenTargetLayer: ArchitecturalLayer;
    severity: FindingSeverity;
    title: string;
    message: string;
    remediation: string;
    enabled: boolean;
}

export const DEFAULT_ARCHITECTURE_CONSTRAINTS: ArchitectureConstraint[] = [
    {
        id: "arch-controller-to-repository",
        sourceLayer: "controllers",
        forbiddenTargetLayer: "repositories",
        severity: "high",
        title: "Controller directly accesses repository",
        message: "Controllers should delegate persistence operations to the service layer instead of directly accessing repositories.",
        remediation: "Inject or call an intermediate service layer function rather than importing the repository directly.",
        enabled: true
    },
    {
        id: "arch-model-to-controller",
        sourceLayer: "models",
        forbiddenTargetLayer: "controllers",
        severity: "high",
        title: "Model depends on controller",
        message: "Domain models must remain decoupled from presentation or controller logic.",
        remediation: "Remove the dependency on the controller; models should encapsulate data and domain validation only.",
        enabled: true
    },
    {
        id: "arch-utility-to-application",
        sourceLayer: "utilities",
        forbiddenTargetLayer: "controllers",
        severity: "high",
        title: "Utility depends on controller",
        message: "Shared utilities must be domain-agnostic and should not depend on application controllers.",
        remediation: "Move application-specific logic out of utility functions or invert the dependency using parameters.",
        enabled: true
    },
    {
        id: "arch-utility-to-service",
        sourceLayer: "utilities",
        forbiddenTargetLayer: "services",
        severity: "medium",
        title: "Utility depends on service",
        message: "Utility modules should remain reusable and not depend on application-level services.",
        remediation: "Pass required data into utility functions instead of importing services directly.",
        enabled: true
    },
    {
        id: "arch-app-to-test",
        sourceLayer: "*",
        forbiddenTargetLayer: "tests",
        severity: "critical",
        title: "Application code depends on test code",
        message: "Production application modules must never import from test files or test fixtures.",
        remediation: "Remove test imports from application source code. Move shared test fixtures to a separate shared helper if needed.",
        enabled: true
    },
    {
        id: "arch-component-to-repository",
        sourceLayer: "components",
        forbiddenTargetLayer: "repositories",
        severity: "high",
        title: "UI component directly accesses repository",
        message: "UI components should not directly query database repositories.",
        remediation: "Fetch data through an API client, controller endpoint, or service instead of directly accessing database repositories.",
        enabled: true
    }
];

export class ArchitectureViolationRule implements AnalysisRule {
    public readonly id = "architecture-violation";

    constructor(
        private constraints: ArchitectureConstraint[] = DEFAULT_ARCHITECTURE_CONSTRAINTS
    ) { }

    public setConstraints(constraints: ArchitectureConstraint[]): void {
        this.constraints = constraints;
    }

    public evaluate(context: RuleContext): AnalysisFinding[] {
        const { dependencyGraph, files } = context;
        const findings: AnalysisFinding[] = [];

        // Pre-classify all files
        const classificationMap = new Map<string, ReturnType<typeof classifyFile>>();
        for (const file of files) {
            classificationMap.set(file.filePath, classifyFile(file.filePath));
        }

        const activeConstraints = this.constraints.filter(c => c.enabled);

        for (const edge of dependencyGraph.edges) {
            const sourceClass = classificationMap.get(edge.source) ?? classifyFile(edge.source);
            const targetClass = classificationMap.get(edge.target) ?? classifyFile(edge.target);

            // Avoid false positives: ignore unclassified or low-confidence classifications,
            // except for tests which are critical if imported by non-tests.
            if (
                sourceClass.layer === "unclassified" ||
                targetClass.layer === "unclassified"
            ) {
                continue;
            }

            for (const constraint of activeConstraints) {
                const sourceMatches =
                    constraint.sourceLayer === "*"
                        ? sourceClass.layer !== "tests"
                        : sourceClass.layer === constraint.sourceLayer;

                const targetMatches = targetClass.layer === constraint.forbiddenTargetLayer;

                if (sourceMatches && targetMatches) {
                    // Avoid false positives if confidence is low
                    if (
                        sourceClass.confidence === "low" &&
                        constraint.sourceLayer !== "*"
                    ) {
                        continue;
                    }

                    findings.push({
                        id: `arch:${constraint.id}:${edge.source}->${edge.target}`,
                        ruleId: this.id,
                        category: "dependency",
                        severity: constraint.severity,
                        title: constraint.title,
                        message: `${constraint.message} (from '${edge.source}' to '${edge.target}')`,
                        filePath: edge.source,
                        location: null,
                        evidence: [
                            `Source layer: '${sourceClass.layer}' (${sourceClass.confidence} confidence)`,
                            `Target layer: '${targetClass.layer}' (${targetClass.confidence} confidence)`,
                            `Import specifier: '${edge.specifier}'`,
                            `Remediation: ${constraint.remediation}`
                        ]
                    });
                }
            }
        }

        return findings;
    }
}

export const architectureViolationRule = new ArchitectureViolationRule();
