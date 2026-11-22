import * as path from "node:path";

import type {
    CallInfo,
    ParsedFile,
    SymbolInfo
} from "../parser/parser-types";

import type { CallResolutionResult } from "./call-graph-types";

const SOURCE_EXTENSIONS = [
    ".ts", ".tsx", ".js", ".jsx",
    ".mts", ".cts", ".mjs", ".cjs"
];

const GLOBAL_IDENTIFIERS = new Set([
    "console",
    "process",
    "global",
    "globalThis",
    "window",
    "document",
    "navigator",
    "location",
    "Math",
    "JSON",
    "Date",
    "Promise",
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "BigInt",
    "Symbol",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Error",
    "TypeError",
    "RangeError",
    "RegExp",
    "Reflect",
    "Proxy",
    "Intl",
    "Buffer",
    "URL",
    "URLSearchParams",
    "AbortController",
    "AbortSignal",
    "Event",
    "EventTarget",
    "fetch",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "queueMicrotask",
    "requestAnimationFrame",
    "cancelAnimationFrame"
]);

function normalize(filePath: string): string {
    return path.posix
        .normalize(filePath.replace(/\\/g, "/"))
        .replace(/^\.\//, "");
}

function isExternalCall(call: CallInfo): boolean {
    if (call.calleeKind === "identifier") {
        return GLOBAL_IDENTIFIERS.has(call.callee);
    }

    if (call.calleeKind === "property") {
        const receiver = call.callee.split(".")[0];

        return receiver !== undefined &&
            GLOBAL_IDENTIFIERS.has(receiver);
    }

    return false;
}

function resolveModulePath(
    fromFile: string,
    specifier: string,
    files: ParsedFile[]
): ParsedFile | undefined {
    if (!specifier.startsWith(".")) {
        return undefined;
    }

    const base = normalize(
        path.posix.join(
            path.posix.dirname(normalize(fromFile)),
            specifier
        )
    );

    const candidates = [
        base,
        ...SOURCE_EXTENSIONS.map(ext => base + ext),
        ...SOURCE_EXTENSIONS.map(ext =>
            path.posix.join(base, "index" + ext)
        )
    ];

    const byPath = new Map(
        files.map(file => [normalize(file.filePath), file])
    );

    for (const candidate of candidates) {
        const found = byPath.get(normalize(candidate));

        if (found) {
            return found;
        }
    }

    return undefined;
}

function getAncestors(
    caller: SymbolInfo,
    symbols: SymbolInfo[]
): Set<string> {
    const byId = new Map(
        symbols.map(symbol => [symbol.id, symbol])
    );

    const ancestors = new Set<string>();

    let currentId: string | null = caller.parentId;

    while (currentId) {
        ancestors.add(currentId);
        currentId = byId.get(currentId)?.parentId ?? null;
    }

    return ancestors;
}

function findClassAncestor(
    caller: SymbolInfo,
    symbols: SymbolInfo[]
): SymbolInfo | undefined {
    const byId = new Map(
        symbols.map(symbol => [symbol.id, symbol])
    );

    let currentId: string | null = caller.parentId;

    while (currentId) {
        const current = byId.get(currentId);

        if (!current) {
            return undefined;
        }

        if (current.kind === "class") {
            return current;
        }

        currentId = current.parentId;
    }

    return undefined;
}

function resolveLocalIdentifier(
    file: ParsedFile,
    caller: SymbolInfo | null,
    name: string
): SymbolInfo[] {
    const candidates = file.symbols.filter(symbol =>
        (symbol.kind === "function" || symbol.kind === "method") &&
        symbol.name === name
    );

    // A top-level call can only directly resolve to a top-level symbol.
    if (!caller) {
        return candidates.filter(
            candidate => candidate.parentId === null
        );
    }

    if (candidates.length <= 1) {
        return candidates;
    }

    const ancestors = getAncestors(caller, file.symbols);

    const scoped = candidates.filter(candidate =>
        candidate.parentId === caller.parentId ||
        (
            candidate.parentId !== null &&
            ancestors.has(candidate.parentId)
        )
    );

    if (scoped.length === 1) {
        return scoped;
    }

    const topLevel = candidates.filter(
        candidate => candidate.parentId === null
    );

    return topLevel.length === 1 ? topLevel : candidates;
}

function findExportedSymbol(
    file: ParsedFile,
    exportedName: string
): SymbolInfo[] {
    const explicit = file.exports.filter(item =>
        item.name === exportedName &&
        !item.moduleSpecifier &&
        item.localName
    );

    const localNames = explicit.map(
        item => item.localName as string
    );

    return file.symbols.filter(symbol =>
        (symbol.kind === "function" || symbol.kind === "method") &&
        (symbol.exported || localNames.includes(symbol.name)) &&
        (
            exportedName === "default"
                ? (
                    explicit.some(item =>
                        item.isDefault &&
                        item.localName === symbol.name
                    ) ||
                    (symbol.exported && symbol.name === "default")
                )
                : (
                    symbol.name === exportedName ||
                    localNames.includes(symbol.name)
                )
        )
    );
}

function resolveImportedIdentifier(
    files: ParsedFile[],
    callerFile: ParsedFile,
    identifier: string
): SymbolInfo[] {
    const matches: SymbolInfo[] = [];

    for (const importInfo of callerFile.imports) {
        if (importInfo.isTypeOnly) {
            continue;
        }

        const targetFile = resolveModulePath(
            callerFile.filePath,
            importInfo.moduleSpecifier,
            files
        );

        if (!targetFile) {
            continue;
        }

        if (importInfo.defaultImport === identifier) {
            matches.push(
                ...findExportedSymbol(targetFile, "default")
            );
        }

        for (const binding of importInfo.namedImportBindings ?? []) {
            if (binding.localName !== identifier) {
                continue;
            }

            matches.push(
                ...findExportedSymbol(
                    targetFile,
                    binding.importedName
                )
            );
        }
    }

    return matches;
}

export function resolveCallTarget(
    files: ParsedFile[],
    callerFile: ParsedFile,
    caller: SymbolInfo | null,
    call: CallInfo
): CallResolutionResult {
    // Recognize known runtime/global APIs before local resolution.
    if (isExternalCall(call)) {
        return {
            targetId: null,
            resolution: "external",
            reason: "Call targets a known JavaScript or runtime global."
        };
    }

    if (call.calleeKind === "identifier") {
        const local = resolveLocalIdentifier(
            callerFile,
            caller,
            call.callee
        );

        if (local.length === 1) {
            return {
                targetId: local[0]!.id,
                resolution: "resolved",
                reason: null
            };
        }

        if (local.length > 1) {
            return {
                targetId: null,
                resolution: "ambiguous",
                reason: "Multiple same-file symbols match this identifier."
            };
        }

        const imported = resolveImportedIdentifier(
            files,
            callerFile,
            call.callee
        );

        if (imported.length === 1) {
            return {
                targetId: imported[0]!.id,
                resolution: "resolved",
                reason: null
            };
        }

        if (imported.length > 1) {
            return {
                targetId: null,
                resolution: "ambiguous",
                reason: "Multiple imported symbols match this identifier."
            };
        }

        return {
            targetId: null,
            resolution: "unresolved",
            reason: "No matching local or imported function was found."
        };
    }

    if (call.calleeKind === "property") {
        if (caller) {
            const parts = call.callee.split(".");
            const methodName = parts[parts.length - 1] ?? "";

            if (parts[0] === "this") {
                const classSymbol = findClassAncestor(
                    caller,
                    callerFile.symbols
                );

                if (classSymbol) {
                    const methods = callerFile.symbols.filter(symbol =>
                        symbol.kind === "method" &&
                        symbol.parentId === classSymbol.id &&
                        symbol.name === methodName
                    );

                    if (methods.length === 1) {
                        return {
                            targetId: methods[0]!.id,
                            resolution: "resolved",
                            reason: null
                        };
                    }

                    if (methods.length > 1) {
                        return {
                            targetId: null,
                            resolution: "ambiguous",
                            reason: "Multiple matching methods exist on this class."
                        };
                    }
                }
            }
        }

        return {
            targetId: null,
            resolution: "unresolved",
            reason: "Property calls require receiver/type information to resolve safely."
        };
    }

    return {
        targetId: null,
        resolution: "unresolved",
        reason: call.calleeKind === "element"
            ? "Element-access calls cannot be statically resolved safely."
            : "Call expression form is not supported by the static resolver."
    };
}