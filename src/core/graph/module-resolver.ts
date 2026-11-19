
import * as path from "node:path";

const supportedExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mts",
    ".cts",
    ".mjs",
    ".cjs"
];

function normalizePath(filePath: string): string {
    return filePath.split(path.sep).join("/");
}

function isInsideRepository(
    rootPath: string,
    filePath: string
): boolean {
    const relative = path.relative(rootPath, filePath);

    return (
        relative !== "" &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
    );
}

export function resolveModule(
    rootPath: string,
    importerPath: string,
    specifier: string,
    repositoryFiles: string[]
): string | null | undefined {
    // Only resolve relative imports for now.
    if (
        !specifier.startsWith("./") &&
        !specifier.startsWith("../")
    ) {
        return null;
    }

    const absoluteRoot = path.resolve(rootPath);

    const absoluteImporter = path.resolve(
        absoluteRoot,
        importerPath
    );

    if (!isInsideRepository(absoluteRoot, absoluteImporter)) {
        return null;
    }

    const importerDirectory = path.dirname(absoluteImporter);

    const absoluteTarget = path.resolve(
        importerDirectory,
        specifier
    );

    // Prevent imports from escaping the repository.
    if (!isInsideRepository(absoluteRoot, absoluteTarget)) {
        return null;
    }

    // Convert discovered paths into a lookup set.
    const knownFiles = new Set(
        repositoryFiles.map(normalizePath)
    );

    const relativeTarget = normalizePath(
        path.relative(absoluteRoot, absoluteTarget)
    );

    const candidates: string[] = [relativeTarget];

    // Try extensions only when the specifier has no extension.
    const targetExtension = path.extname(absoluteTarget).toLowerCase();

    if (!supportedExtensions.includes(targetExtension)) {
        for (const extension of supportedExtensions) {
            candidates.push(`${relativeTarget}${extension}`);
        }

        // Try directory index files.
        for (const extension of supportedExtensions) {
            candidates.push(
                `${relativeTarget}/index${extension}`
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