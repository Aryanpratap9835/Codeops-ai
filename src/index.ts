import { executeCommand } from "./cli/cli-runner";

async function main(): Promise<void> {
    const exitCode = await executeCommand(process.argv.slice(2));
    if (exitCode !== 0) {
        process.exitCode = exitCode;
    }
}

main().catch(error => {
    console.error("\nCodeOps encountered an unexpected error:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
