
import * as path from "node:path";

import { scanRepository } from "./core/repository/scanner";
import { parseRepository } from "./core/parser/parser";
import { buildDependencyGraph } from "./core/graph/graph-builder";
import { buildCallGraph } from "./core/call-graph/call-graph-builder";
import { analyzeRepository } from "./core/rules/analysis-engine";

function printHelp(): void {
    console.log(`
====================================
          CodeOps CLI
====================================

Usage:
  npm run dev -- analyze <repository-path> [--json]
  npm run dev -- help

Commands:
  analyze    Analyze a local repository
  help       Display this help message

Options:
  --json     Output analysis as JSON

Examples:
  npm run dev -- analyze ./test-repo
  npm run dev -- analyze . --json
`);
}

function printReport(
    rootPath: string,
    scannedCount: number,
    scanErrors: number,
    analysis: ReturnType<typeof analyzeRepository>
): void {
    const { metrics, findings, deadCodeCandidates, risks } = analysis;

    console.log(`
====================================
       CodeOps Repository Analysis
====================================

Repository: ${rootPath}

[1] Repository Overview
-----------------------
Scanned files:          ${scannedCount}
Parsed files:           ${metrics.fileCount}
Scan errors:            ${scanErrors}
Parse errors:           ${analysis.parseErrors.length}

[2] Code Metrics
----------------
Symbols:                ${metrics.symbolCount}
Functions:              ${metrics.functionCount}
Classes:                ${metrics.classCount}
Imports:                ${metrics.importCount}

[3] Call Graph
--------------
Total calls:            ${metrics.callCount}
Resolved calls:         ${metrics.resolvedCallCount}
Unresolved calls:       ${metrics.unresolvedCallCount}
Ambiguous calls:        ${metrics.ambiguousCallCount}

[4] Dependency Analysis
-----------------------
Circular dependencies:  ${metrics.circularDependencyCount}

[5] Dead Code Analysis
----------------------
Candidates:             ${deadCodeCandidates.length}
`);

    for (const candidate of deadCodeCandidates) {
        console.log(
            `  - ${candidate.name} (${candidate.filePath}:${candidate.location.start})`
        );
    }

    console.log(`
[6] Risk Analysis
-----------------
Files analyzed:         ${risks.length}
High risk files:        ${risks.filter(r => r.level === "high").length}
Medium risk files:      ${risks.filter(r => r.level === "medium").length}

[7] Findings
------------
Total findings:         ${findings.length}
`);

    for (const finding of findings) {
        console.log(
            `  [${finding.severity.toUpperCase()}] ${finding.title}`
        );
        console.log(`  ${finding.message}`);

        if (finding.filePath) {
            console.log(`  File: ${finding.filePath}`);
        }

        console.log();
    }

    if (analysis.parseErrors.length > 0) {
        console.log("[8] Parse Errors");
        console.log("----------------");

        for (const error of analysis.parseErrors) {
            console.log(`  ${error.filePath}: ${error.message}`);
        }
    }

    console.log("====================================");
    console.log("          Analysis Complete");
    console.log("====================================");
}

async function analyzeCommand(
    repositoryArgument: string,
    jsonOutput: boolean
): Promise<void> {
    const rootPath = path.resolve(process.cwd(), repositoryArgument);

    console.log(`Analyzing repository: ${rootPath}`);

    const scanResult = await scanRepository(rootPath);

    const parseResult = await parseRepository(
        rootPath,
        scanResult.files
    );

    const dependencyGraph = buildDependencyGraph(
        rootPath,
        parseResult.files
    );

    const callGraph = buildCallGraph(
        parseResult.files,
        rootPath
    );

    const analysis = analyzeRepository(
        {
            files: parseResult.files,
            dependencyGraph,
            callGraph
        },
        parseResult.errors
    );

    if (jsonOutput) {
        console.log(JSON.stringify({
            repository: rootPath,
            scan: {
                scannedFiles: scanResult.files.length,
                errors: scanResult.errors
            },
            dependencyGraph,
            callGraph,
            analysis
        }, null, 2));

        return;
    }

    printReport(
        rootPath,
        scanResult.files.length,
        scanResult.errors.length,
        analysis
    );

    if (scanResult.errors.length > 0) {
        console.log("\nScan Errors:");

        for (const error of scanResult.errors) {
            console.log(`  ${error.path}: ${error.message}`);
        }
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    const command = args[0];

    if (!command || command === "help" || command === "--help") {
        printHelp();
        return;
    }

    if (command === "analyze") {
        const repositoryArgument = args[1];

        if (!repositoryArgument || repositoryArgument.startsWith("--")) {
            console.error("Error: Please provide a repository path.");
            printHelp();
            process.exitCode = 1;
            return;
        }

        const jsonOutput = args.includes("--json");

        await analyzeCommand(repositoryArgument, jsonOutput);
        return;
    }

    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
}

main().catch(error => {
    console.error("\nCodeOps encountered an error:");

    console.error(
        error instanceof Error ? error.message : error
    );

    process.exitCode = 1;
});