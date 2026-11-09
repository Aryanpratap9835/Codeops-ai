
import * as fs from "fs/promises";
import * as path from "path";

export async function scanRepository(
    rootPath: string
): Promise<string[]> {

    const allFiles: string[] = [];

    async function scanDirectory(
        currentPath: string
    ): Promise<void> {
        const entries = await fs.readdir(currentPath, {
            withFileTypes: true
        });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {

                await scanDirectory(fullPath);

            } else if (entry.isFile()) {
                const relativePath = path.relative(rootPath, fullPath);

                allFiles.push(relativePath);
            }
        }
    }
    await scanDirectory(rootPath);

    return allFiles;
}