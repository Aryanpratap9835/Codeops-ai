

import * as path from "node:path";

import type { ModuleResolver } from "../graph/module-resolver";
import { createModuleResolver } from "../graph/module-resolver";
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
    "console", "process", "global", "globalThis",
    "window", "document", "navigator", "location",
    "Math", "JSON", "Date", "Promise", "Object",
    "Array", "String", "Number", "Boolean", "BigInt",
    "Symbol", "Map", "Set", "WeakMap", "WeakSet",
    "Error", "TypeError", "RangeError", "RegExp",
    "Reflect", "Proxy", "Intl", "Buffer", "URL",
    "URLSearchParams", "AbortController", "AbortSignal",
    "Event", "EventTarget", "fetch", "setTimeout",
    "clearTimeout", "setInterval", "clearInterval",
    "queueMicrotask", "requestAnimationFrame",
    "cancelAnimationFrame"
]);

// Heuristic classification only: these names commonly refer to
// standard JavaScript methods, but receiver types are not verified.
const BUILTIN_METHODS = new Set([
    "map", "filter", "find", "findIndex", "some", "every",
    "reduce", "reduceRight", "forEach", "sort", "reverse",
    "includes", "indexOf", "lastIndexOf", "slice", "splice",
    "concat", "flat", "flatMap", "join", "push", "pop",
    "shift", "unshift", "at",
    "startsWith", "endsWith", "trim", "trimStart", "trimEnd",
    "toLowerCase", "toUpperCase", "replace", "replaceAll",
    "split", "substring", "charAt",
    "hasOwnProperty", "toString", "valueOf"
]);

// Common test-framework assertion methods, e.g. expect(value).toBe(...).
const TEST_MATCHER_METHODS = new Set([
    "toBe", "toEqual", "toStrictEqual", "toBeDefined",
    "toBeUndefined", "toBeNull", "toBeTruthy", "toBeFalsy",
    "toContain", "toHaveLength", "toHaveProperty",
    "toThrow", "toMatch", "toMatchObject",
    "toBeInstanceOf", "toBeGreaterThan", "toBeLessThan",
    "toBeGreaterThanOrEqual", "toBeLessThanOrEqual",
    "toHaveBeenCalled", "toHaveBeenCalledWith",
    "toHaveBeenCalledTimes", "toHaveReturned"
]);

function normalize(filePath: string): string {
    return path.posix
        .normalize(filePath.replace(/\\/g, "/"))
        .replace(/^\.\//, "");
}

function isExternalModuleSpecifier(specifier: string): boolean {
    // Relative imports may point to files inside the analyzed repository.
    return !specifier.startsWith(".");
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

function getCalleeRoot(callee: string): string | null {
    const match = callee.match(/^[A-Za-z_$][\w$]*/);
    return match?.[0] ?? null;
}

function getMethodName(callee: string): string {
    const parts = callee.split(".");
    return parts[parts.length - 1] ?? "";
}

function isImportedFromExternalModule(
    file: ParsedFile,
    call: CallInfo,
    moduleResolver: ModuleResolver
): boolean {
    const root = getCalleeRoot(call.callee);

    if (!root) {
        return false;
    }

    for (const importInfo of file.imports) {
        if (
            importInfo.isTypeOnly ||
            moduleResolver.isLocalSpecifier(
                importInfo.moduleSpecifier
            )
        ) {
            continue;
        }

        if (
            call.calleeKind === "identifier" &&
            (
                importInfo.defaultImport === call.callee ||
                importInfo.namedImportBindings?.some(
                    binding => binding.localName === call.callee
                )
            )
        ) {
            return true;
        }

        if (
            call.calleeKind === "property" &&
            (
                importInfo.namespaceImport === root ||
                importInfo.defaultImport === root ||
                importInfo.namedImportBindings?.some(
                    binding => binding.localName === root
                )
            )
        ) {
            return true;
        }
    }

    return false;
}
function isKnownMethodCall(call: CallInfo): boolean {
    if (call.calleeKind !== "property") {
        return false;
    }

    const methodName = getMethodName(call.callee);

    return BUILTIN_METHODS.has(methodName) ||
        TEST_MATCHER_METHODS.has(methodName);
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

function findDirectlyExportedSymbols(
    file: ParsedFile,
    exportedName: string
): SymbolInfo[] {
    const matchingExports = file.exports.filter(item =>
        item.moduleSpecifier === null &&
        item.name === exportedName &&
        item.localName
    );

    const localNames = matchingExports.map(
        item => item.localName as string
    );

    return file.symbols.filter(symbol =>
        (
            symbol.kind === "function" ||
            symbol.kind === "method"
        ) &&
        (
            symbol.exported ||
            localNames.includes(symbol.name)
        ) &&
        (
            symbol.name === exportedName ||
            localNames.includes(symbol.name)
        )
    );
}

function findExportedSymbols(
    files: ParsedFile[],
    file: ParsedFile,
    exportedName: string,
    moduleResolver: ModuleResolver,
    visited: Set<string> = new Set()
): SymbolInfo[] {
    const visitKey = `${normalize(file.filePath)}:${exportedName}`;

    if (visited.has(visitKey)) {
        return [];
    }

    visited.add(visitKey);

    const matches = new Map<string, SymbolInfo>();

    // 1. Check symbols exported directly by this file.
    for (const symbol of findDirectlyExportedSymbols(
        file,
        exportedName
    )) {
        matches.set(symbol.id, symbol);
    }

    // 2. Follow named re-exports and export * declarations.
    for (const exportInfo of file.exports) {
        if (!exportInfo.moduleSpecifier) {
            continue;
        }

        let nextExportName: string | null = null;

        if (
            exportInfo.kind === "re-export" &&
            exportInfo.name === exportedName
        ) {
            // export { originalName as publicName } from "./module"
            nextExportName = exportInfo.localName ?? exportInfo.name;
        } else if (
            exportInfo.kind === "export-all" &&
            exportedName !== "default"
        ) {
            // export * from "./module"
            nextExportName = exportedName;
        }

        if (!nextExportName) {
            continue;
        }

        const targetPath = moduleResolver.resolve(
            file.filePath,
            exportInfo.moduleSpecifier
        );

        if (!targetPath) {
            continue;
        }

        const targetFile = files.find(
            candidate =>
                normalize(candidate.filePath) === targetPath
        );

        if (!targetFile) {
            continue;
        }

        const resolved = findExportedSymbols(
            files,
            targetFile,
            nextExportName,
            moduleResolver,
            visited
        );

        for (const symbol of resolved) {
            matches.set(symbol.id, symbol);
        }
    }

    return [...matches.values()];
}

function resolveImportedIdentifier(
    files: ParsedFile[],
    callerFile: ParsedFile,
    identifier: string,
    moduleResolver: ModuleResolver
): SymbolInfo[] {
    const matches = new Map<string, SymbolInfo>();

    for (const importInfo of callerFile.imports) {
        if (importInfo.isTypeOnly || importInfo.isDynamic) {
            continue;
        }

        const targetPath = moduleResolver.resolve(
            callerFile.filePath,
            importInfo.moduleSpecifier
        );

        if (!targetPath) {
            continue;
        }

        const targetFile = files.find(
            file => normalize(file.filePath) === targetPath
        );

        if (!targetFile) {
            continue;
        }

        if (importInfo.defaultImport === identifier) {
            for (const symbol of findExportedSymbols(
                files,
                targetFile,
                "default",
                moduleResolver
            )) {
                matches.set(symbol.id, symbol);
            }
        }

        for (const binding of importInfo.namedImportBindings ?? []) {
            if (binding.localName !== identifier) {
                continue;
            }

            for (const symbol of findExportedSymbols(
                files,
                targetFile,
                binding.importedName,
                moduleResolver
            )) {
                matches.set(symbol.id, symbol);
            }
        }
    }

    return [...matches.values()];
}
function resolveNamespaceCall(
    files: ParsedFile[],
    callerFile: ParsedFile,
    call: CallInfo,
    moduleResolver: ModuleResolver
): CallResolutionResult | null {
    const parts = call.callee.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const [namespaceName, memberName] = parts;

    if (!namespaceName || !memberName) {
        return null;
    }

    // 1. Direct namespace import: import * as ns from "./module"
    for (const importInfo of callerFile.imports) {
        if (importInfo.isTypeOnly || importInfo.isDynamic) {
            continue;
        }

        if (importInfo.namespaceImport === namespaceName) {
            const targetPath = moduleResolver.resolve(
                callerFile.filePath,
                importInfo.moduleSpecifier
            );

            if (!targetPath) {
                return {
                    targetId: null,
                    resolution: "unresolved",
                    reason: `Cannot resolve module path '${importInfo.moduleSpecifier}' for namespace '${namespaceName}'.`
                };
            }

            const targetFile = files.find(
                f => normalize(f.filePath) === targetPath
            );

            if (!targetFile) {
                return {
                    targetId: null,
                    resolution: "unresolved",
                    reason: `Resolved module file '${targetPath}' was not found in parsed files.`
                };
            }

            const symbols = findExportedSymbols(
                files,
                targetFile,
                memberName,
                moduleResolver
            );

            if (symbols.length === 1) {
                return {
                    targetId: symbols[0]!.id,
                    resolution: "resolved",
                    reason: null
                };
            }

            if (symbols.length > 1) {
                return {
                    targetId: null,
                    resolution: "ambiguous",
                    reason: `Multiple symbols match '${memberName}' on namespace '${namespaceName}'.`
                };
            }

            return {
                targetId: null,
                resolution: "unresolved",
                reason: `Symbol '${memberName}' is not exported by namespace '${namespaceName}' in '${targetFile.filePath}'.`
            };
        }

        // 2. Named import matching a namespace re-export
        for (const binding of importInfo.namedImportBindings ?? []) {
            if (binding.localName !== namespaceName) {
                continue;
            }

            const targetPath = moduleResolver.resolve(
                callerFile.filePath,
                importInfo.moduleSpecifier
            );

            if (!targetPath) {
                continue;
            }

            const targetFile = files.find(
                f => normalize(f.filePath) === targetPath
            );

            if (!targetFile) {
                continue;
            }

            const nsExport = targetFile.exports.find(
                exp =>
                    exp.kind === "namespace-re-export" &&
                    exp.name === binding.importedName &&
                    exp.moduleSpecifier !== null
            );

            if (nsExport && nsExport.moduleSpecifier) {
                const subTargetPath = moduleResolver.resolve(
                    targetFile.filePath,
                    nsExport.moduleSpecifier
                );

                if (subTargetPath) {
                    const subTargetFile = files.find(
                        f => normalize(f.filePath) === subTargetPath
                    );

                    if (subTargetFile) {
                        const symbols = findExportedSymbols(
                            files,
                            subTargetFile,
                            memberName,
                            moduleResolver
                        );

                        if (symbols.length === 1) {
                            return {
                                targetId: symbols[0]!.id,
                                resolution: "resolved",
                                reason: null
                            };
                        }

                        if (symbols.length > 1) {
                            return {
                                targetId: null,
                                resolution: "ambiguous",
                                reason: `Multiple symbols match '${memberName}' on namespace '${namespaceName}'.`
                            };
                        }
                    }
                }
            }
        }
    }

    // 3. Local class static method
    const localClass = callerFile.symbols.find(
        s => s.kind === "class" && s.name === namespaceName
    );

    if (localClass) {
        const methods = callerFile.symbols.filter(
            s => s.kind === "method" && s.parentId === localClass.id && s.name === memberName
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
                reason: `Multiple matching methods '${memberName}' on class '${namespaceName}'.`
            };
        }
    }

    return null;
}

export function resolveCallTarget(
    files: ParsedFile[],
    callerFile: ParsedFile,
    caller: SymbolInfo | null,
    call: CallInfo,
    moduleResolver: ModuleResolver = createModuleResolver(
        "",
        files.map(f => f.filePath)
    )
): CallResolutionResult {
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
            call.callee,
            moduleResolver
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

        if (isImportedFromExternalModule(callerFile, call, moduleResolver)) {
            return {
                targetId: null,
                resolution: "external",
                reason: "Call targets a function imported from an external module."
            };
        }

        return {
            targetId: null,
            resolution: "unresolved",
            reason: "No matching local or imported function was found."
        };
    }

    if (call.calleeKind === "property") {
        if (isImportedFromExternalModule(callerFile, call, moduleResolver)) {
            return {
                targetId: null,
                resolution: "external",
                reason: "Call targets an object or namespace imported from an external module."
            };
        }

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

        const namespaceResult = resolveNamespaceCall(
            files,
            callerFile,
            call,
            moduleResolver
        );

        if (namespaceResult) {
            return namespaceResult;
        }

        if (isKnownMethodCall(call)) {
            return {
                targetId: null,
                resolution: "external",
                reason: "Call uses a commonly known JavaScript or test-framework method; receiver type is not verified."
            };
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