import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as http from "node:http";
import { handleApiRequest } from "../../src/server/api-router";
import { createServer } from "../../src/server/server";
import { executeCommand } from "../../src/cli/cli-runner";

interface MockResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}

function executeMockRequest(url: string, repoPath: string): Promise<MockResponse> {
    return new Promise((resolve) => {
        let statusCode = 200;
        let headers: Record<string, string> = {};

        const req = {
            url
        } as http.IncomingMessage;

        const res = {
            headersSent: false,
            writeHead(code: number, hdrs?: Record<string, string>) {
                statusCode = code;
                if (hdrs) headers = { ...headers, ...hdrs };
                this.headersSent = true;
            },
            end(data?: string) {
                this.headersSent = true;
                resolve({
                    statusCode,
                    headers,
                    body: data ?? ""
                });
            }
        } as unknown as http.ServerResponse;

        handleApiRequest(req, res, repoPath);
    });
}

describe("Milestone 8 — Web Dashboard & REST API", () => {
    const testRepoPath = path.resolve(__dirname, "../../test-repo");

    it("creates an http.Server instance with createServer", () => {
        const server = createServer(testRepoPath);
        expect(server).toBeInstanceOf(http.Server);
    });

    it("serves the HTML dashboard at GET /", async () => {
        const res = await executeMockRequest("/", testRepoPath);
        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Type"]).toContain("text/html");
        expect(res.body).toContain("CodeOps");
        expect(res.body).toContain("Dashboard");
        expect(res.body).toContain("tab-btn");
    });

    it("serves the HTML dashboard at GET /dashboard", async () => {
        const res = await executeMockRequest("/dashboard", testRepoPath);
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("CodeOps");
        expect(res.body).toContain("Dashboard");
    });

    it("returns repository overview and dependency graph at GET /api/overview", async () => {
        const res = await executeMockRequest("/api/overview", testRepoPath);
        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Type"]).toContain("application/json");
        const data = JSON.parse(res.body);
        expect(data.schemaVersion).toBe("1.0.0");
        expect(data.repository.scannedFiles).toBeGreaterThan(0);
        expect(data.analysis.dependencyGraph).toBeDefined();
        expect(data.dependencyHealth.healthScore).toBeGreaterThanOrEqual(0);
    });

    it("returns architecture layers at GET /api/architecture", async () => {
        const res = await executeMockRequest("/api/architecture", testRepoPath);
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.architecture).toBeDefined();
        expect(Array.isArray(data.architecture.layers)).toBe(true);
        expect(data.architecture.layers.length).toBeGreaterThan(0);
    });

    it("returns dependency health at GET /api/dependencies", async () => {
        const res = await executeMockRequest("/api/dependencies", testRepoPath);
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.graph).toBeDefined();
        expect(data.health).toBeDefined();
        expect(data.health.circularDependencyCount).toBeDefined();
    });

    it("returns security findings at GET /api/security", async () => {
        const res = await executeMockRequest("/api/security", testRepoPath);
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.security).toBeDefined();
        expect(data.security.findings).toBeDefined();
        expect(data.security.summary).toBeDefined();
    });

    it("returns hotspots ranking at GET /api/hotspots", async () => {
        const res = await executeMockRequest("/api/hotspots", testRepoPath);
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.hotspots).toBeDefined();
        expect(Array.isArray(data.hotspots.hotspots)).toBe(true);
    });

    it("returns change impact analysis for a valid file at GET /api/impact?file=...", async () => {
        const res = await executeMockRequest("/api/impact?file=src/services/user.service.ts", testRepoPath);
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.impact).toBeDefined();
        expect(Array.isArray(data.impact.directDependents)).toBe(true);
    });

    it("returns 400 when GET /api/impact is called without a file parameter", async () => {
        const res = await executeMockRequest("/api/impact", testRepoPath);
        expect(res.statusCode).toBe(400);
        const data = JSON.parse(res.body);
        expect(data.error).toContain("Missing required query parameter: 'file'");
    });

    it("tracks scan history across requests at GET /api/history", async () => {
        // Trigger overview once to ensure a scan record is pushed
        await executeMockRequest("/api/overview", testRepoPath);
        const res = await executeMockRequest("/api/history", testRepoPath);
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.totalScans).toBeGreaterThan(0);
        expect(Array.isArray(data.history)).toBe(true);
    });

    it("returns 404 for non-existent endpoints", async () => {
        const res = await executeMockRequest("/api/nonexistent", testRepoPath);
        expect(res.statusCode).toBe(404);
        const data = JSON.parse(res.body);
        expect(data.error).toContain("not found");
    });

    it("supports CLI serve command in test-mode", async () => {
        const exitCode = await executeCommand(["serve", testRepoPath, "--port", "0", "--test-mode"]);
        expect(exitCode).toBe(0);
    });
});
