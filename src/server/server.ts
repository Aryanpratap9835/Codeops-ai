import * as http from "node:http";
import { handleApiRequest } from "./api-router";

export interface ServerOptions {
    port?: number;
    host?: string;
}

export function createServer(repoPath: string): http.Server {
    const server = http.createServer(async (req, res) => {
        try {
            await handleApiRequest(req, res, repoPath);
        } catch (err) {
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            }
        }
    });

    return server;
}

export async function startServer(repoPath: string, port = 3000, host = "localhost"): Promise<http.Server> {
    const server = createServer(repoPath);

    return new Promise((resolve, reject) => {
        server.on("error", (err) => {
            reject(err);
        });

        server.listen(port, host, () => {
            resolve(server);
        });
    });
}
