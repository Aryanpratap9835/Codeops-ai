import { scanRepository } from "../repository/scanner";
import { parseRepository } from "../parser/parser";
import { buildDependencyGraph } from "../graph/graph-builder";
import { buildCallGraph } from "../call-graph/call-graph-builder";
import { analyzeSecurity } from "../security/security-engine";
import { analyzeCodeIntelligence } from "../intelligence/intelligence-engine";
import { CacheManager } from "./cache-manager";
import type { PerformanceProfile } from "./cache-types";

export async function profileRepositoryAnalysis(
    rootPath: string,
    options: { useCache?: boolean } = {}
): Promise<PerformanceProfile> {
    const useCache = options.useCache ?? true;
    const cacheManager = new CacheManager(rootPath);
    const manifest = useCache ? cacheManager.loadManifest() : null;

    const startTime = performance.now();

    // 1. Scanning phase
    const scanStart = performance.now();
    const scanResult = await scanRepository(rootPath);
    const scanTimeMs = Math.round(performance.now() - scanStart);

    // 2. Parsing phase (with cache tracking)
    const parseStart = performance.now();
    const diff = cacheManager.computeDiff(scanResult.files, manifest);

    let cacheHitCount = 0;
    let cacheMissCount = 0;

    const filesToParse = useCache
        ? [...diff.newFiles, ...diff.modifiedFiles]
        : scanResult.files;

    cacheHitCount = scanResult.files.length - filesToParse.length;
    cacheMissCount = filesToParse.length;

    const parseResult = await parseRepository(rootPath, scanResult.files);
    const parseTimeMs = Math.round(performance.now() - parseStart);

    // 3. Graph Construction phase
    const graphStart = performance.now();
    const depGraph = buildDependencyGraph(rootPath, parseResult.files);
    buildCallGraph(parseResult.files, rootPath);
    const graphBuildTimeMs = Math.round(performance.now() - graphStart);

    // 4. Security Analysis phase
    const secStart = performance.now();
    analyzeSecurity(parseResult.files.map(f => ({ filePath: f.filePath })));
    const securityTimeMs = Math.round(performance.now() - secStart);

    // 5. Code Intelligence phase
    const intelStart = performance.now();
    analyzeCodeIntelligence(parseResult.files.map(f => ({ filePath: f.filePath })));
    const intelligenceTimeMs = Math.round(performance.now() - intelStart);

    const totalTimeMs = Math.round(performance.now() - startTime);
    const totalFiles = scanResult.files.length || 1;
    const cacheHitRate = Math.round((cacheHitCount / totalFiles) * 100);

    const memoryUsageMb = Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10;

    return {
        repositoryPath: rootPath,
        fileCount: scanResult.files.length,
        scanTimeMs,
        parseTimeMs,
        graphBuildTimeMs,
        securityTimeMs,
        intelligenceTimeMs,
        totalTimeMs,
        cacheHitCount,
        cacheMissCount,
        cacheHitRate,
        memoryUsageMb
    };
}

export function formatProfileReport(profile: PerformanceProfile): string {
    return [
        "====================================",
        "     Performance Profile Report",
        "====================================",
        `Repository:         ${profile.repositoryPath}`,
        `Total Files:        ${profile.fileCount}`,
        `Total Time:         ${profile.totalTimeMs} ms`,
        `Heap Memory Used:   ${profile.memoryUsageMb} MB`,
        "",
        "Phase Timings:",
        "------------------------------------",
        `  • Scanning:       ${profile.scanTimeMs} ms`,
        `  • Parsing:        ${profile.parseTimeMs} ms`,
        `  • Graph Building: ${profile.graphBuildTimeMs} ms`,
        `  • Security Check: ${profile.securityTimeMs} ms`,
        `  • Intelligence:   ${profile.intelligenceTimeMs} ms`,
        "",
        "Cache Efficiency:",
        "------------------------------------",
        `  • Cache Hits:     ${profile.cacheHitCount}`,
        `  • Cache Misses:   ${profile.cacheMissCount}`,
        `  • Cache Hit Rate: ${profile.cacheHitRate}%`,
        "===================================="
    ].join("\n");
}
