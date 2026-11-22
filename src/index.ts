
import path from "node:path";

import { scanRepository } from "./core/repository/scanner";
import { parseRepository } from "./core/parser/parser";
import { buildDependencyGraph } from "./core/graph/graph-builder";
import { buildCallGraph } from "./core/call-graph/call-graph-builder";
import { analyzeRepository } from "./core/rules/analysis-engine";

async function main(): Promise<void> {
    const rootPath = path.resolve("./test-repo");

    console.log("\nCodeOps Repository Analysis");
    console.log("===========================\n");

    const scanResult = await scanRepository(rootPath);

    console.log(`Scanned files: ${scanResult.files.length}`);
    console.log(`Scan errors: ${scanResult.errors.length}`);

    const parseResult = await parseRepository(
        rootPath,
        scanResult.files
    );

    console.log(`Parsed files: ${parseResult.files.length}`);
    console.log(`Parse errors: ${parseResult.errors.length}`);

    const dependencyGraph = buildDependencyGraph(
        rootPath,
        parseResult.files
    );

    const callGraph = buildCallGraph(parseResult.files);

    const report = analyzeRepository(
        {
            files: parseResult.files,
            dependencyGraph,
            callGraph
        },
        parseResult.errors
    );

    console.log("\nRepository Metrics");
    console.log("------------------");
    console.log(JSON.stringify(report.metrics, null, 2));

    console.log("\nSemantic Analysis");
    console.log("-----------------");
    console.log(JSON.stringify(report.semantic, null, 2));

    console.log("\nDead-Code Candidates");
    console.log("--------------------");
    console.log(JSON.stringify(report.deadCodeCandidates, null, 2));

    console.log("\nFile Risks");
    console.log("----------");
    console.log(JSON.stringify(report.risks, null, 2));

    console.log("\nFindings");
    console.log("--------");
    console.log(JSON.stringify(report.findings, null, 2));

    console.log("\nAnalysis completed.");
}

main().catch(error => {
    console.error("CodeOps analysis failed:", error);
    process.exitCode = 1;
});