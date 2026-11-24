import type { IncomingMessage, ServerResponse } from "node:http";
import { runFullAnalysis } from "../cli/cli-runner";
import { getAdvancedImpactReport } from "../core/graph/graph-analysis";
import { getDashboardHtml } from "./dashboard-ui";
import type { ScanHistoryRecord } from "./server-types";

// In-memory scan history
const scanHistory: ScanHistoryRecord[] = [];

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res: ServerResponse, html: string): void {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
}

export async function handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    defaultRepoPath: string
): Promise<void> {
    const reqUrl = req.url ?? "/";
    const parsedUrl = new URL(reqUrl, "http://localhost");
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    const repoPath = (typeof query.repo === "string" ? query.repo : defaultRepoPath);

    // Serve HTML Dashboard
    if (pathname === "/" || pathname === "/dashboard") {
        sendHtml(res, getDashboardHtml());
        return;
    }

    if (pathname === "/api/overview") {
        try {
            const { report, dependencyGraph } = await runFullAnalysis(repoPath);

            // Record into scan history
            const historyRecord: ScanHistoryRecord = {
                id: `scan-${Date.now()}`,
                timestamp: new Date().toISOString(),
                repositoryPath: repoPath,
                fileCount: report.repository.scannedFiles,
                healthScore: report.dependencyHealth.healthScore,
                securityScore: report.security?.summary.score ?? 100,
                criticalFindings: report.security?.summary.severityDistribution.critical ?? 0,
                circularDependencies: report.dependencyHealth.circularDependencyCount,
                report
            };
            scanHistory.push(historyRecord);

            sendJson(res, 200, {
                ...report,
                analysis: {
                    ...report.analysis,
                    dependencyGraph
                }
            });
        } catch (err) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
    }

    if (pathname === "/api/architecture") {
        try {
            const { report } = await runFullAnalysis(repoPath);
            sendJson(res, 200, { architecture: report.architecture });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return;
    }

    if (pathname === "/api/dependencies") {
        try {
            const { report, dependencyGraph } = await runFullAnalysis(repoPath);
            sendJson(res, 200, {
                graph: dependencyGraph,
                health: report.dependencyHealth
            });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return;
    }

    if (pathname === "/api/security") {
        try {
            const { report } = await runFullAnalysis(repoPath);
            sendJson(res, 200, { security: report.security });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return;
    }

    if (pathname === "/api/hotspots") {
        try {
            const { report } = await runFullAnalysis(repoPath);
            sendJson(res, 200, { hotspots: report.hotspots });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return;
    }

    if (pathname === "/api/impact") {
        try {
            const targetFile = typeof query.file === "string" ? query.file : "";
            if (!targetFile) {
                sendJson(res, 400, { error: "Missing required query parameter: 'file'" });
                return;
            }

            const { dependencyGraph, callGraph, parseResult } = await runFullAnalysis(repoPath);

            const matched = parseResult.files.find(f => {
                const norm = f.filePath.replace(/\\/g, "/");
                const targetNorm = targetFile.replace(/\\/g, "/");
                return norm === targetNorm || norm.endsWith(targetNorm);
            });

            const resolvedTarget = matched ? matched.filePath : targetFile;
            const impact = getAdvancedImpactReport(dependencyGraph, resolvedTarget, { callGraph });

            sendJson(res, 200, { impact });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return;
    }

    if (pathname === "/api/history") {
        const repoScans = scanHistory.filter(s => s.repositoryPath === repoPath);
        sendJson(res, 200, {
            totalScans: repoScans.length,
            history: repoScans.slice(-10)
        });
        return;
    }

    sendJson(res, 404, { error: `Endpoint '${pathname}' not found` });
}
