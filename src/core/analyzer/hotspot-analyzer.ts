import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import { findCircularDependencyGroups } from "../graph/graph-analysis";

export interface HotspotFactor {
    name: string;
    score: number;
    maxScore: number;
    evidence: string;
}

export interface HotspotItem {
    filePath: string;
    score: number; // 0 to 100
    riskTier: "critical" | "high" | "medium" | "low";
    fanIn: number;
    fanOut: number;
    unresolvedCalls: number;
    circular: boolean;
    diagnostics: number;
    symbolCount: number;
    factors: HotspotFactor[];
}

export interface HotspotReport {
    hotspots: HotspotItem[];
    topHotspots: HotspotItem[];
    averageScore: number;
    criticalCount: number;
    highCount: number;
}

export function detectHotspots(
    files: ParsedFile[],
    dependencyGraph: GraphResult,
    callGraph: CallGraphResult
): HotspotReport {
    const circularGroups = findCircularDependencyGroups(dependencyGraph);
    const circularFiles = new Set(circularGroups.flat());

    const incomingMap = new Map<string, number>();
    const outgoingMap = new Map<string, number>();

    for (const edge of dependencyGraph.edges) {
        incomingMap.set(edge.target, (incomingMap.get(edge.target) ?? 0) + 1);
        outgoingMap.set(edge.source, (outgoingMap.get(edge.source) ?? 0) + 1);
    }

    const hotspots: HotspotItem[] = files.map(file => {
        const fanIn = incomingMap.get(file.filePath) ?? 0;
        const fanOut = outgoingMap.get(file.filePath) ?? 0;

        const unresolvedCalls = callGraph.edges.filter(
            e => e.filePath === file.filePath &&
                (e.resolution === "unresolved" || e.resolution === "ambiguous")
        ).length;

        const circular = circularFiles.has(file.filePath);
        const diagnostics = file.diagnostics.length;
        const symbolCount = file.symbols.length;

        const factors: HotspotFactor[] = [];

        // Factor 1: Coupling & Connectivity (max 30)
        const couplingPoints = Math.min(30, (fanIn * 3) + (fanOut * 3));
        factors.push({
            name: "Coupling",
            score: couplingPoints,
            maxScore: 30,
            evidence: `Fan-in: ${fanIn}, Fan-out: ${fanOut}`
        });

        // Factor 2: Circular Dependency (max 25)
        const circularPoints = circular ? 25 : 0;
        factors.push({
            name: "Circularity",
            score: circularPoints,
            maxScore: 25,
            evidence: circular ? "Part of a circular dependency group" : "No cycles"
        });

        // Factor 3: Call Resolution Risk (max 20)
        const callPoints = Math.min(20, unresolvedCalls * 5);
        factors.push({
            name: "Unresolved Calls",
            score: callPoints,
            maxScore: 20,
            evidence: `${unresolvedCalls} unresolved or ambiguous call(s)`
        });

        // Factor 4: Parser / Syntax Diagnostics (max 15)
        const diagnosticPoints = Math.min(15, diagnostics * 5);
        factors.push({
            name: "Parser Diagnostics",
            score: diagnosticPoints,
            maxScore: 15,
            evidence: `${diagnostics} diagnostic message(s)`
        });

        // Factor 5: Module Size / Symbol Density (max 10)
        const sizePoints = symbolCount >= 20 ? 10 : symbolCount >= 10 ? 5 : 0;
        factors.push({
            name: "Module Size",
            score: sizePoints,
            maxScore: 10,
            evidence: `${symbolCount} declared symbol(s)`
        });

        const totalScore = Math.min(
            100,
            couplingPoints + circularPoints + callPoints + diagnosticPoints + sizePoints
        );

        const riskTier: HotspotItem["riskTier"] =
            totalScore >= 70 ? "critical" :
                totalScore >= 45 ? "high" :
                    totalScore >= 25 ? "medium" : "low";

        return {
            filePath: file.filePath,
            score: totalScore,
            riskTier,
            fanIn,
            fanOut,
            unresolvedCalls,
            circular,
            diagnostics,
            symbolCount,
            factors
        };
    }).sort((a, b) => b.score - a.score);

    const totalScoreSum = hotspots.reduce((sum, h) => sum + h.score, 0);
    const averageScore = hotspots.length > 0
        ? Math.round((totalScoreSum / hotspots.length) * 10) / 10
        : 0;

    return {
        hotspots,
        topHotspots: hotspots.slice(0, 10),
        averageScore,
        criticalCount: hotspots.filter(h => h.riskTier === "critical").length,
        highCount: hotspots.filter(h => h.riskTier === "high").length
    };
}
