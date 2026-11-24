import * as path from "node:path";
import type { GraphResult } from "../graph/graph-type";
import type {
    ArchitecturalLayer,
    ArchitectureReport,
    ClassifiedFile,
    LayerDependency,
    LayerSummary,
    ClassificationConfidence
} from "./architecture-types";

interface LayerRule {
    layer: ArchitecturalLayer;
    folderPatterns: RegExp[];
    filePatterns: RegExp[];
}

const LAYER_RULES: LayerRule[] = [
    {
        layer: "tests",
        folderPatterns: [/(?:^|[\\/])(?:tests?|__tests__|specs?)(?:[\\/]|$)/i],
        filePatterns: [/\.(?:test|spec)\.[a-z0-9]+$/i]
    },
    {
        layer: "controllers",
        folderPatterns: [/(?:^|[\\/])controllers?(?:[\\/]|$)/i],
        filePatterns: [/\.controller\.[a-z0-9]+$/i]
    },
    {
        layer: "routes",
        folderPatterns: [/(?:^|[\\/])(?:routes?|routers?)(?:[\\/]|$)/i],
        filePatterns: [/\.(?:route|router)\.[a-z0-9]+$/i]
    },
    {
        layer: "services",
        folderPatterns: [/(?:^|[\\/])services?(?:[\\/]|$)/i],
        filePatterns: [/\.service\.[a-z0-9]+$/i]
    },
    {
        layer: "repositories",
        folderPatterns: [/(?:^|[\\/])(?:repositories?|repos?|dao)(?:[\\/]|$)/i],
        filePatterns: [/\.(?:repository|repo|dao)\.[a-z0-9]+$/i]
    },
    {
        layer: "models",
        folderPatterns: [/(?:^|[\\/])(?:models?|entities?|schemas?)(?:[\\/]|$)/i],
        filePatterns: [/\.(?:model|entity|schema)\.[a-z0-9]+$/i]
    },
    {
        layer: "middleware",
        folderPatterns: [/(?:^|[\\/])middlewares?(?:[\\/]|$)/i],
        filePatterns: [/\.middleware\.[a-z0-9]+$/i]
    },
    {
        layer: "components",
        folderPatterns: [/(?:^|[\\/])(?:components?|views?|pages?|ui)(?:[\\/]|$)/i],
        filePatterns: [/\.component\.[a-z0-9]+$/i, /\.(?:tsx|jsx)$/i]
    },
    {
        layer: "config",
        folderPatterns: [/(?:^|[\\/])configs?(?:[\\/]|$)/i],
        filePatterns: [/(?:^|[\\/])(?:.*\.config|config)\.[a-z0-9]+$/i]
    },
    {
        layer: "utilities",
        folderPatterns: [/(?:^|[\\/])(?:utils?|utilities|helpers?|common|shared)(?:[\\/]|$)/i],
        filePatterns: [/\.(?:util|helper)\.[a-z0-9]+$/i]
    }
];

function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/");
}

export function classifyFile(filePath: string): ClassifiedFile {
    const normalized = normalizePath(filePath);
    const fileName = path.posix.basename(normalized);

    for (const rule of LAYER_RULES) {
        const folderMatch = rule.folderPatterns.some(pattern => pattern.test(normalized));
        const fileMatch = rule.filePatterns.some(pattern => pattern.test(fileName));

        if (folderMatch && fileMatch) {
            return {
                filePath,
                layer: rule.layer,
                confidence: "high",
                evidence: [
                    `Directory matches '${rule.layer}' pattern`,
                    `File name '${fileName}' matches '${rule.layer}' naming convention`
                ]
            };
        }

        if (folderMatch) {
            // Tests folder is high confidence even without .test suffix
            const confidence: ClassificationConfidence = rule.layer === "tests" ? "high" : "medium";
            return {
                filePath,
                layer: rule.layer,
                confidence,
                evidence: [`Directory path matches '${rule.layer}' structure`]
            };
        }

        if (fileMatch) {
            // .tsx without components folder might be a generic page or component
            const confidence: ClassificationConfidence =
                fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? "medium" : "high";
            return {
                filePath,
                layer: rule.layer,
                confidence,
                evidence: [`File name '${fileName}' matches '${rule.layer}' naming convention`]
            };
        }
    }

    return {
        filePath,
        layer: "unclassified",
        confidence: "low",
        evidence: ["Path and file name do not match common architectural patterns"]
    };
}

export function detectArchitecture(
    files: string[],
    dependencyGraph?: GraphResult
): ArchitectureReport {
    const classifiedFiles = files.map(classifyFile);
    const classificationMap = new Map<string, ClassifiedFile>();

    for (const cf of classifiedFiles) {
        classificationMap.set(normalizePath(cf.filePath), cf);
    }

    const layerGroups = new Map<ArchitecturalLayer, string[]>();
    for (const cf of classifiedFiles) {
        const list = layerGroups.get(cf.layer) ?? [];
        list.push(cf.filePath);
        layerGroups.set(cf.layer, list);
    }

    const layers: LayerSummary[] = [];
    const layerNames: ArchitecturalLayer[] = [
        "controllers", "routes", "services", "repositories",
        "models", "middleware", "utilities", "config", "tests", "components"
    ];

    for (const name of layerNames) {
        const fileList = layerGroups.get(name) ?? [];
        if (fileList.length > 0) {
            layers.push({
                layer: name,
                fileCount: fileList.length,
                files: fileList
            });
        }
    }

    const unclassifiedFiles = layerGroups.get("unclassified") ?? [];
    const unclassifiedPercentage = files.length > 0
        ? Math.round((unclassifiedFiles.length / files.length) * 100)
        : 0;

    // Analyze dependencies between layers
    const layerDepsMap = new Map<string, LayerDependency>();

    if (dependencyGraph) {
        for (const edge of dependencyGraph.edges) {
            const sourceClass = classificationMap.get(normalizePath(edge.source));
            const targetClass = classificationMap.get(normalizePath(edge.target));

            if (!sourceClass || !targetClass) {
                continue;
            }

            const key = `${sourceClass.layer}->${targetClass.layer}`;
            let dep = layerDepsMap.get(key);

            if (!dep) {
                dep = {
                    sourceLayer: sourceClass.layer,
                    targetLayer: targetClass.layer,
                    edgeCount: 0,
                    sampleEdges: []
                };
                layerDepsMap.set(key, dep);
            }

            dep.edgeCount++;
            if (dep.sampleEdges.length < 5) {
                dep.sampleEdges.push({
                    source: edge.source,
                    target: edge.target,
                    specifier: edge.specifier
                });
            }
        }
    }

    const layerDependencies = [...layerDepsMap.values()].sort((a, b) => b.edgeCount - a.edgeCount);

    // Identify possible organization issues
    const organizationIssues: string[] = [];

    if (files.length >= 5 && unclassifiedPercentage > 50) {
        organizationIssues.push(
            `High proportion (${unclassifiedPercentage}%) of files do not follow standard architectural folder or file conventions.`
        );
    }

    // Check for layer cycles: e.g. layer A -> layer B and layer B -> layer A
    const layerEdges = new Set(layerDependencies.map(d => `${d.sourceLayer}->${d.targetLayer}`));
    for (const dep of layerDependencies) {
        if (dep.sourceLayer === dep.targetLayer || dep.sourceLayer === "unclassified" || dep.targetLayer === "unclassified") {
            continue;
        }
        const reverseKey = `${dep.targetLayer}->${dep.sourceLayer}`;
        if (layerEdges.has(reverseKey) && dep.sourceLayer < dep.targetLayer) {
            organizationIssues.push(
                `Bidirectional dependency detected between layer '${dep.sourceLayer}' and '${dep.targetLayer}'.`
            );
        }
    }

    return {
        layers,
        classifiedFiles,
        layerDependencies,
        unclassifiedFiles,
        unclassifiedPercentage,
        organizationIssues
    };
}
