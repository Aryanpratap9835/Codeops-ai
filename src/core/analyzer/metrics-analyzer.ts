
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import type { CallGraphResult } from "../call-graph/call-graph-types";
import type {
    DeadCodeCandidate,
    RepositoryMetrics,
    FileMetrics
} from "./analysis-types";
import { findCircularDependencyGroups } from "../graph/graph-analysis";

export function calculateRepositoryMetrics(
    files: ParsedFile[],
    dependencyGraph: GraphResult,
    callGraph: CallGraphResult,
    deadCodeCandidates: DeadCodeCandidate[]
): RepositoryMetrics {
    const circularGroups =
        findCircularDependencyGroups(dependencyGraph);

    const fileMetrics: FileMetrics[] = files.map(file => {
        const incomingDependencies = dependencyGraph.edges.filter(
            edge => edge.target === file.filePath
        ).length;

        const outgoingDependencies = dependencyGraph.edges.filter(
            edge => edge.source === file.filePath
        ).length;

        const fileCalls = callGraph.edges.filter(
            edge => edge.filePath === file.filePath
        );

        return {
            filePath: file.filePath,
            symbolCount: file.symbols.length,
            functionCount: file.symbols.filter(
                symbol => symbol.kind === "function"
            ).length,
            classCount: file.symbols.filter(
                symbol => symbol.kind === "class"
            ).length,
            importCount: file.imports.length,
            callCount: fileCalls.length,
            unresolvedCallCount: fileCalls.filter(
                edge => edge.resolution === "unresolved"
            ).length,
            incomingDependencies,
            outgoingDependencies
        };
    });

    const totalSymbols = files.reduce(
        (sum, file) => sum + file.symbols.length,
        0
    );

    const totalFunctions = files.reduce(
        (sum, file) =>
            sum + file.symbols.filter(
                symbol => symbol.kind === "function"
            ).length,
        0
    );

    const totalClasses = files.reduce(
        (sum, file) =>
            sum + file.symbols.filter(
                symbol => symbol.kind === "class"
            ).length,
        0
    );

    return {
        fileCount: files.length,
        symbolCount: totalSymbols,
        functionCount: totalFunctions,
        classCount: totalClasses,
        importCount: files.reduce(
            (sum, file) => sum + file.imports.length,
            0
        ),
        callCount: callGraph.edges.length,
        resolvedCallCount: callGraph.edges.filter(
            edge => edge.resolution === "resolved"
        ).length,
        unresolvedCallCount: callGraph.edges.filter(
            edge => edge.resolution === "unresolved"
        ).length,
        ambiguousCallCount: callGraph.edges.filter(
            edge => edge.resolution === "ambiguous"
        ).length,
        circularDependencyCount: circularGroups.length,
        deadCodeCandidateCount: deadCodeCandidates.length,
        files: fileMetrics
    };
}