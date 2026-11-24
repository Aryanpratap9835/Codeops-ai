
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const SUPPORTED_EXTENSIONS = [
    ".ts", ".tsx", ".js", ".jsx",
    ".mts", ".cts", ".mjs", ".cjs"
];

export interface ModuleResolver {
    resolve(importerPath: string, specifier: string): string | null;
    isLocalSpecifier(specifier: string): boolean;
}

function normalize(filePath: string): string {
    return path.posix
        .normalize(filePath.replace(/\\/g, "/"))
        .replace(/^\.\//, "");
}

function isInsideRoot(root: string, target: string): boolean {
    const relative = path.relative(root, target);

    return (
        !path.isAbsolute(relative) &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`)
    );
}

function readCompilerOptions(rootPath: string): {
    options: ts.CompilerOptions;
    configDirectory: string;
} {
    const configPath = path.join(rootPath, "tsconfig.json");
    const configDirectory = path.dirname(configPath);

    if (!fs.existsSync(configPath)) {
        return {
            options: {},
            configDirectory
        };
    }

    const configFile = ts.readConfigFile(
        configPath,
        ts.sys.readFile
    );

    if (configFile.error) {
        return {
            options: {},
            configDirectory
        };
    }

    const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        configDirectory,
        undefined,
        configPath
    );

    return {
        options: parsed.options,
        configDirectory
    };
}

function matchPathPattern(
    pattern: string,
    specifier: string
): string | null {
    const starIndex = pattern.indexOf("*");

    if (starIndex === -1) {
        return pattern === specifier ? "" : null;
    }

    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);

    if (
        !specifier.startsWith(prefix) ||
        !specifier.endsWith(suffix)
    ) {
        return null;
    }

    return specifier.slice(
        prefix.length,
        specifier.length - suffix.length
    );
}

export function createModuleResolver(
    rootPath: string,
    repositoryFiles: string[]
): ModuleResolver {
    const absoluteRoot = path.resolve(rootPath);

    const knownFiles = new Set(
        repositoryFiles.map(normalize)
    );

    const { options, configDirectory } =
        readCompilerOptions(absoluteRoot);

    const baseUrl = options.baseUrl
        ? path.resolve(options.baseUrl)
        : configDirectory;

    const paths = options.paths ?? {};

    const pathMappings = Object.entries(paths)
        .sort((a, b) => {
            const aPrefix = a[0].split("*")[0] ?? "";
            const bPrefix = b[0].split("*")[0] ?? "";

            return bPrefix.length - aPrefix.length;
        });

    function findFile(absoluteTarget: string): string | null {
        if (!isInsideRoot(absoluteRoot, absoluteTarget)) {
            return null;
        }

        const relativeTarget = normalize(
            path.relative(absoluteRoot, absoluteTarget)
        );

        const candidates = [relativeTarget];

        const extension = path.extname(absoluteTarget).toLowerCase();

        if (!SUPPORTED_EXTENSIONS.includes(extension)) {
            for (const ext of SUPPORTED_EXTENSIONS) {
                candidates.push(`${relativeTarget}${ext}`);
            }

            for (const ext of SUPPORTED_EXTENSIONS) {
                candidates.push(
                    normalize(`${relativeTarget}/index${ext}`)
                );
            }
        }

        for (const candidate of candidates) {
            if (knownFiles.has(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    function resolveRelative(
        importerPath: string,
        specifier: string
    ): string | null {
        const absoluteImporter = path.resolve(
            absoluteRoot,
            importerPath
        );

        if (!isInsideRoot(absoluteRoot, absoluteImporter)) {
            return null;
        }

        const target = path.resolve(
            path.dirname(absoluteImporter),
            specifier
        );

        return findFile(target);
    }

    function resolveAlias(specifier: string): string | null {
        for (const [pattern, targets] of pathMappings) {
            const wildcard = matchPathPattern(
                pattern,
                specifier
            );

            if (wildcard === null) {
                continue;
            }

            for (const target of targets) {
                const substituted = target.replace("*", wildcard);

                const absoluteTarget = path.resolve(
                    baseUrl,
                    substituted
                );

                const resolved = findFile(absoluteTarget);

                if (resolved) {
                    return resolved;
                }
            }
        }

        return null;
    }

    function resolve(
        importerPath: string,
        specifier: string
    ): string | null {
        if (
            specifier.startsWith("./") ||
            specifier.startsWith("../")
        ) {
            return resolveRelative(importerPath, specifier);
        }

        const aliasResult = resolveAlias(specifier);

        if (aliasResult) {
            return aliasResult;
        }

        // baseUrl-based imports are supported when configured.
        if (options.baseUrl) {
            return findFile(
                path.resolve(baseUrl, specifier)
            );
        }

        return null;
    }

    function isLocalSpecifier(specifier: string): boolean {
        if (
            specifier.startsWith("./") ||
            specifier.startsWith("../")
        ) {
            return true;
        }

        if (
            pathMappings.some(([pattern]) =>
                matchPathPattern(pattern, specifier) !== null
            )
        ) {
            return true;
        }

        if (options.baseUrl) {
            return findFile(
                path.resolve(baseUrl, specifier)
            ) !== null;
        }

        return false;
    }

    return {
        resolve,
        isLocalSpecifier
    };
}

// Backward-compatible API for existing callers and tests.
export function resolveModule(
    rootPath: string,
    importerPath: string,
    specifier: string,
    repositoryFiles: string[]
): string | null {
    return createModuleResolver(
        rootPath,
        repositoryFiles
    ).resolve(importerPath, specifier);
}