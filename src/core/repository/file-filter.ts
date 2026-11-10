import * as path from "path";
const ignoredDirectories = [
    "node_modules",
    ".git",
    "dist",
    "coverage"
];
const extension = [
    ".ts", ".tsx", ".java", ".js", ".cpp", ".py"
]
export function shouldIgnore(name: string): boolean {
    if (ignoredDirectories.includes(name)) return true;
    return false
}
export function shouldTake(name: string): boolean {
    const ext = path.extname(name);
    return extension.includes(ext)
}