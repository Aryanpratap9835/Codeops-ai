
import { ParsedFile, SymbolInfo } from "../parser/parser-types";
import { createModuleResolver } from "../graph/module-resolver";
import {
    CallGraphEdge,
    CallGraphNode,
    CallGraphResult
} from "./call-graph-types";
import { resolveCallTarget } from "./call-resolver";

export function buildCallGraph(
    files: ParsedFile[],
    rootPath: string = process.cwd()
): CallGraphResult {
    const nodes: CallGraphNode[] = [];
    const edges: CallGraphEdge[] = [];

    const symbolsById = new Map<string, SymbolInfo>();

    const moduleResolver = createModuleResolver(
        rootPath,
        files.map(file => file.filePath)
    );

    for (const file of files) {
        for (const symbol of file.symbols) {
            if (
                symbol.kind !== "function" &&
                symbol.kind !== "method"
            ) {
                continue;
            }

            symbolsById.set(symbol.id, symbol);

            nodes.push({
                id: symbol.id,
                name: symbol.name,
                qualifiedName: symbol.qualifiedName,
                kind: symbol.kind,
                filePath: symbol.filePath,
                location: symbol.location,
                exported: symbol.exported,
                parentId: symbol.parentId
            });
        }
    }

    for (const file of files) {
        for (const call of file.calls) {
            const caller = call.callerId
                ? symbolsById.get(call.callerId) ?? null
                : null;

            const resolution = resolveCallTarget(
                files,
                file,
                caller,
                call,
                moduleResolver
            );

            edges.push({
                id: `${file.filePath}:call:${call.location.start}`,
                source: call.callerId,
                target: resolution.targetId,
                callee: call.callee,
                calleeKind: call.calleeKind,
                resolution: resolution.resolution,
                reason: resolution.reason,
                filePath: file.filePath,
                location: call.location
            });
        }
    }

    return {
        nodes,
        edges
    };
}