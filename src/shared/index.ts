
import * as path from "node:path";

import { scanRepository } from "../core/repository/scanner";
import { parseRepository } from "../core/parser/parser";
import { buildDependencyGraph } from "../core/graph/graph-builder";
import { buildCallGraph } from "../core/call-graph/call-graph-builder";
import { analyzeRepository } from "../core/rules/analysis-engine";

function printHelp(): void {
    console.log(`
CodeOps - Repository Intelligence CLI

Usage:
  codeops analyze <repository-path> [options]

Commands:
  analyze <path>    Analyze a local repository
  help              Show this help message

Options:
  --json            Print the complete analysis report as JSON
  -h, --help        Show help

Examples:
  npx tsx src/index.ts analyze ./test-repo
  npx tsx src/index.ts analyze .
  npx tsx src/index.ts analyze ../my-project --json
`);
}

async function analyze(repositoryPath: string, json: boolean): Promise<void> {
    const rootPath = path.resolve(process.cwd(), repositoryPath);

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

    const report = analyzeRepository(
        {
            files: parseResult.files,
            dependencyGraph,
            callGraph
        },
        parseResult.errors
    );

    if (json) {
        console.log(JSON.stringify({
            repository: rootPath,
            scanErrors: scanResult.errors,
            ...report
        }, null, 2));

        return;
    }

    const { metrics, semantic, findings, deadCodeCandidates, risks } = report;

    console.log("\n====================================");
    console.log("       CodeOps Repository Analysis");
    console.log("====================================");

    console.log(`\nRepository: ${rootPath}`);

    console.log("\n[1] Repository Overview");
    console.log("----------------------");
    console.log(`Scanned files:          ${scanResult.files.length}`);
    console.log(`Parsed files:           ${parseResult.files.length}`);
    console.log(`Scan errors:            ${scanResult.errors.length}`);
    console.log(`Parse errors:           ${report.parseErrors.length}`);
    console.log(`Symbols:                ${metrics.symbolCount}`);
    console.log(`Functions:              ${metrics.functionCount}`);
    console.log(`Classes:                ${metrics.classCount}`);
    console.log(`Imports:                ${metrics.importCount}`);

    console.log("\n[2] Dependency Analysis");
    console.log("----------------------");
    console.log(`Circular dependencies:  ${metrics.circularDependencyCount}`);

    console.log("\n[3] Call Graph Analysis");
    console.log("----------------------");
    console.log(`Total calls:            ${metrics.callCount}`);
    console.log(`Resolved calls:         ${semantic.resolvedCallCount}`);
    console.log(`Unresolved calls:       ${semantic.unresolvedCallCount}`);
    console.log(`Ambiguous calls:        ${semantic.ambiguousCallCount}`);

    console.log("\n[4] Dead-Code Analysis");
    console.log("---------------------");
    console.log(`Potential dead-code candidates: ${deadCodeCandidates.length}`);

    for (const candidate of deadCodeCandidates) {
        console.log(`  - ${candidate.qualifiedName} (${candidate.filePath}:${candidate.location.line})`);
    }

    console.log("\n[5] Risk Analysis");
    console.log("-----------------");
    console.log(`Files analyzed: ${risks.length}`);

    for (const risk of risks) {
        if (risk.level === "high" || risk.level === "medium") {
            console.log(
                `  - [${risk.level.toUpperCase()}] ${risk.filePath} (score: ${risk.score})`
            );

            for (const reason of risk.reasons) {
                console.log(`      ${reason}`);
            }
        }
    }

    console.log("\n[6] Findings");
    console.log("------------");

    if (findings.length === 0) {
        console.log("No findings detected.");
    } else {
        console.log(`Total findings: ${findings.length}`);

        for (const finding of findings) {
            const location = finding.filePath
                ? `${finding.filePath}${finding.location ? `:${finding.location.line}` : ""}`
                : "Repository-wide";

            console.log(
                `\n[${finding.severity.toUpperCase()}] ${finding.title}`
            );
            console.log(`  Rule: ${finding.ruleId}`);
            console.log(`  Location: ${location}`);
            console.log(`  ${finding.message}`);

            for (const evidence of finding.evidence) {
                console.log(`  Evidence: ${evidence}`);
            }
        }
    }

    if (scanResult.errors.length > 0) {
        console.log("\n[7] Scanner Errors");
        console.log("-----------------");

        for (const error of scanResult.errors) {
            console.log(`  ${error.path}: ${error.message}`);
        }
    }

    if (report.parseErrors.length > 0) {
        console.log("\n[8] Parser Errors");
        console.log("----------------");

        for (const error of report.parseErrors) {
            console.log(`  ${error.filePath}: ${error.message}`);
        }
    }

    console.log("\n====================================");
    console.log("         Analysis completed");
    console.log("====================================\n");
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    const command = args[0];

    if (!command || command === "help" || command === "--help" || command === "-h") {
        printHelp();
        return;
    }

    if (command !== "analyze") {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
        return;
    }

    const repositoryPath = args[1];

    if (!repositoryPath || repositoryPath.startsWith("--")) {
        console.error("Error: Please provide a repository path.");
        printHelp();
        process.exitCode = 1;
        return;
    }

    const options = args.slice(2);
    const unknownOptions = options.filter(option => option !== "--json");

    if (unknownOptions.length > 0) {
        console.error(`Unknown option: ${unknownOptions[0]}`);
        printHelp();
        process.exitCode = 1;
        return;
    }

    await analyze(repositoryPath, options.includes("--json"));
}

main().catch(error => {
    console.error("\nCodeOps analysis failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});