import * as path from "node:path";
import type { GraphResult } from "../graph/graph-type";
import type {
    ModuleCouplingMetrics,
    CouplingReport,
    SuspiciousPattern
} from "./coupling-types";

function normalize(p: string): string {
    return p.replace(/\\/g, "/");
}

function calculateConcentration(outgoing: string[]): number {
    if (outgoing.length === 0) {
        return 0;
    }

    // Group outgoing targets by their containing directory
    const dirCounts = new Map<string, number>();

    for (const target of outgoing) {
        const dir = path.posix.dirname(normalize(target));
        dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }

    const maxInSingleDir = Math.max(...dirCounts.values());
    return Math.round((maxInSingleDir / outgoing.length) * 100) / 100;
}

export function analyzeModuleCoupling(
    graph: GraphResult,
    options: {
        excessiveFanOutThreshold?: number;
        centralFanInThreshold?: number;
        highCouplingThreshold?: number;
    } = {}
): CouplingReport {
    const excessiveFanOutThreshold = options.excessiveFanOutThreshold ?? 8;
    const centralFanInThreshold = options.centralFanInThreshold ?? 4;
    const highCouplingThreshold = options.highCouplingThreshold ?? 50;

    const incomingMap = new Map<string, Set<string>>();
    const outgoingMap = new Map<string, Set<string>>();

    for (const node of graph.nodes) {
        const id = normalize(node.id);
        incomingMap.set(id, new Set());
        outgoingMap.set(id, new Set());
    }

    for (const edge of graph.edges) {
        const source = normalize(edge.source);
        const target = normalize(edge.target);

        if (!outgoingMap.has(source)) {
            outgoingMap.set(source, new Set());
        }
        if (!incomingMap.has(target)) {
            incomingMap.set(target, new Set());
        }

        outgoingMap.get(source)!.add(target);
        incomingMap.get(target)!.add(source);
    }

    const allFiles = [...new Set([...incomingMap.keys(), ...outgoingMap.keys()])].sort();

    const modules: ModuleCouplingMetrics[] = allFiles.map(filePath => {
        const incoming = [...(incomingMap.get(filePath) ?? [])].sort();
        const outgoing = [...(outgoingMap.get(filePath) ?? [])].sort();

        const fanIn = incoming.length;
        const fanOut = outgoing.length;

        const totalDeps = fanIn + fanOut;
        const instability = totalDeps === 0
            ? 0
            : Math.round((fanOut / totalDeps) * 100) / 100;

        const dependencyConcentration = calculateConcentration(outgoing);

        // Coupling score combines connectivity and concentration
        const rawScore = (fanIn * 5) + (fanOut * 6) + (dependencyConcentration * 15);
        const couplingScore = Math.min(100, Math.round(rawScore));

        return {
            filePath,
            fanIn,
            fanOut,
            incomingDependencies: incoming,
            outgoingDependencies: outgoing,
            dependencyConcentration,
            instability,
            couplingScore
        };
    }).sort((a, b) => b.couplingScore - a.couplingScore);

    const totalFanIn = modules.reduce((sum, m) => sum + m.fanIn, 0);
    const totalFanOut = modules.reduce((sum, m) => sum + m.fanOut, 0);
    const totalInstability = modules.reduce((sum, m) => sum + m.instability, 0);

    const count = modules.length || 1;
    const averageFanIn = Math.round((totalFanIn / count) * 10) / 10;
    const averageFanOut = Math.round((totalFanOut / count) * 10) / 10;
    const averageInstability = Math.round((totalInstability / count) * 100) / 100;

    const highlyConnectedModules = modules.filter(
        m => m.couplingScore >= highCouplingThreshold || (m.fanIn + m.fanOut) >= 8
    );

    const excessiveDependencyModules = modules.filter(
        m => m.fanOut >= excessiveFanOutThreshold
    );

    const centralModules = modules.filter(
        m => m.fanIn >= centralFanInThreshold && m.instability <= 0.35
    );

    const suspiciousPatterns: SuspiciousPattern[] = [];

    for (const m of modules) {
        // Hub module pattern: both heavily depended upon and heavily dependent
        if (m.fanIn >= 4 && m.fanOut >= 4) {
            suspiciousPatterns.push({
                filePath: m.filePath,
                patternType: "hub-module",
                description: `Module acts as a structural hub with high incoming (${m.fanIn}) and high outgoing (${m.fanOut}) dependencies.`,
                evidence: [
                    `Fan-in: ${m.fanIn}`,
                    `Fan-out: ${m.fanOut}`,
                    `Instability: ${m.instability}`,
                    `High risk of ripple-effect bugs when modified`
                ]
            });
        } else if (m.fanOut >= excessiveFanOutThreshold) {
            suspiciousPatterns.push({
                filePath: m.filePath,
                patternType: "excessive-dependencies",
                description: `Module has excessive outgoing dependencies (${m.fanOut}), exceeding threshold (${excessiveFanOutThreshold}).`,
                evidence: [
                    `Outgoing dependencies: ${m.fanOut}`,
                    `May violate Single Responsibility Principle`
                ]
            });
        }
    }

    return {
        modules,
        averageFanIn,
        averageFanOut,
        averageInstability,
        highlyConnectedModules,
        excessiveDependencyModules,
        centralModules,
        suspiciousPatterns
    };
}
