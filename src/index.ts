import { scanRepository } from "./core/repository/scanner";
async function main() {
    const result = await scanRepository("./test-repo/missing-folder");
    // Test 1: Valid repository
    await scanRepository("./test-repo");

    // Test 2: Missing repository
    await scanRepository("./missing-folder");

    // Test 3: File instead of directory
    await scanRepository("./test-repo/src/index.ts");
    console.log("Scanned files:", result.files);
    console.log("Scanning errors:", result.errors);

}
main()