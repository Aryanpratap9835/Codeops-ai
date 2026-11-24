import type { ParsedFile } from "../parser/parser-types";
import type { SecurityFinding } from "../security/security-types";

export const CACHE_VERSION = "1.0.0";

export interface CachedFileEntry {
    filePath: string;
    contentHash: string;
    fileSize: number;
    mtimeMs: number;
    parsedFile: ParsedFile;
    securityFindings?: SecurityFinding[];
}

export interface CacheManifest {
    version: string;
    codeopsVersion: string;
    updatedAt: string;
    files: Record<string, CachedFileEntry>;
}

export interface CacheDiff {
    newFiles: string[];
    modifiedFiles: string[];
    deletedFiles: string[];
    unchangedFiles: string[];
}

export interface PerformanceProfile {
    repositoryPath: string;
    fileCount: number;
    scanTimeMs: number;
    parseTimeMs: number;
    graphBuildTimeMs: number;
    securityTimeMs: number;
    intelligenceTimeMs: number;
    totalTimeMs: number;
    cacheHitCount: number;
    cacheMissCount: number;
    cacheHitRate: number; // 0 to 100%
    memoryUsageMb: number;
}
