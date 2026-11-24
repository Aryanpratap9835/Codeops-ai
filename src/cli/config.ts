import * as fs from "node:fs";
import * as path from "node:path";

export interface CodeOpsConfig {
    exclude?: string[];
    thresholds?: {
        excessiveFanOut?: number;
        highCoupling?: number;
        maxHotspotScore?: number;
    };
    architectureRules?: {
        id: string;
        enabled: boolean;
    }[];
}

export function loadConfig(rootPath: string): CodeOpsConfig {
    const configPath = path.join(rootPath, "codeops.config.json");

    if (!fs.existsSync(configPath)) {
        return {};
    }

    try {
        const content = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(content) as CodeOpsConfig;
    } catch {
        return {};
    }
}
