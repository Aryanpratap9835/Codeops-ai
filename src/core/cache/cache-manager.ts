import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { ParsedFile } from "../parser/parser-types";
import type { GraphResult } from "../graph/graph-type";
import { getTransitiveDependents } from "../graph/graph-analysis";
import {
    CACHE_VERSION,
    CachedFileEntry,
    CacheManifest,
    CacheDiff
} from "./cache-types";

function computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
}

export class CacheManager {
    private readonly cacheDir: string;
    private readonly manifestPath: string;

    constructor(private readonly rootPath: string, customCacheDir?: string) {
        this.cacheDir = customCacheDir ?? path.join(rootPath, ".codeops-cache");
        this.manifestPath = path.join(this.cacheDir, "manifest.json");
    }

    public loadManifest(): CacheManifest | null {
        if (!fs.existsSync(this.manifestPath)) {
            return null;
        }

        try {
            const raw = fs.readFileSync(this.manifestPath, "utf-8");
            const parsed = JSON.parse(raw) as CacheManifest;

            if (parsed.version !== CACHE_VERSION) {
                // Invalidate mismatched cache version
                return null;
            }

            return parsed;
        } catch {
            // Corrupted cache file: recover safely by clearing
            return null;
        }
    }

    public saveManifest(manifest: CacheManifest): void {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
        } catch {
            // Fail safely if permissions prevent writing
        }
    }

    public clearCache(): boolean {
        if (!fs.existsSync(this.cacheDir)) {
            return false;
        }

        try {
            fs.rmSync(this.cacheDir, { recursive: true, force: true });
            return true;
        } catch {
            return false;
        }
    }

    public computeDiff(
        currentFiles: string[],
        oldManifest: CacheManifest | null
    ): CacheDiff {
        if (!oldManifest) {
            return {
                newFiles: [...currentFiles],
                modifiedFiles: [],
                deletedFiles: [],
                unchangedFiles: []
            };
        }

        const oldFileKeys = new Set(Object.keys(oldManifest.files));
        const currentSet = new Set(currentFiles);

        const newFiles: string[] = [];
        const modifiedFiles: string[] = [];
        const unchangedFiles: string[] = [];

        for (const file of currentFiles) {
            if (!oldFileKeys.has(file)) {
                newFiles.push(file);
                continue;
            }

            const cached = oldManifest.files[file]!;
            const fullPath = path.resolve(this.rootPath, file);

            try {
                const stat = fs.statSync(fullPath);
                // Fast path: check mtime and size first
                if (stat.size === cached.fileSize && Math.abs(stat.mtimeMs - cached.mtimeMs) < 10) {
                    unchangedFiles.push(file);
                    continue;
                }

                // Accurate path: check content hash
                const content = fs.readFileSync(fullPath, "utf-8");
                const currentHash = computeHash(content);

                if (currentHash === cached.contentHash) {
                    unchangedFiles.push(file);
                } else {
                    modifiedFiles.push(file);
                }
            } catch {
                modifiedFiles.push(file);
            }
        }

        const deletedFiles = [...oldFileKeys].filter(f => !currentSet.has(f));

        return {
            newFiles,
            modifiedFiles,
            deletedFiles,
            unchangedFiles
        };
    }

    public getInvalidatedDependents(
        modifiedFiles: string[],
        graph: GraphResult
    ): Set<string> {
        const invalidated = new Set<string>();

        for (const mod of modifiedFiles) {
            invalidated.add(mod);
            const dependents = getTransitiveDependents(graph, mod);
            for (const dep of dependents) {
                invalidated.add(dep);
            }
        }

        return invalidated;
    }

    public createCacheEntry(
        filePath: string,
        parsedFile: ParsedFile,
        content: string
    ): CachedFileEntry {
        const fullPath = path.resolve(this.rootPath, filePath);
        let mtimeMs = Date.now();
        let fileSize = content.length;

        try {
            const stat = fs.statSync(fullPath);
            mtimeMs = stat.mtimeMs;
            fileSize = stat.size;
        } catch {
            // fallback to length
        }

        return {
            filePath,
            contentHash: computeHash(content),
            fileSize,
            mtimeMs,
            parsedFile
        };
    }
}
