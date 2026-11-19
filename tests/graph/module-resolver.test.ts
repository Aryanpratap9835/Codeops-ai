
import { describe, it, expect } from "vitest";
import { resolveModule } from "../../src/core/graph/module-resolver";

const root = "D:/test-repo";

const files = [
    "src/user/user.service.ts",
    "src/user/user.repository.ts",
    "src/user/index.ts",
    "src/database/database.ts",
    "src/shared/types.tsx"
];

describe("Module Resolver", () => {
    it("resolves a relative import", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "./user.repository",
            files
        );

        expect(result).toBe("src/user/user.repository.ts");
    });

    it("resolves an import with an explicit extension", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "./user.repository.ts",
            files
        );

        expect(result).toBe("src/user/user.repository.ts");
    });

    it("resolves an index file", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "./",
            files
        );

        expect(result).toBe("src/user/index.ts");
    });

    it("resolves parent directory imports", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "../database/database",
            files
        );

        expect(result).toBe("src/database/database.ts");
    });

    it("returns null for missing modules", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "./missing",
            files
        );

        expect(result).toBeNull();
    });

    it("does not resolve external packages", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "express",
            files
        );

        expect(result).toBeNull();
    });

    it("does not resolve paths outside the repository", () => {
        const result = resolveModule(
            root,
            "src/user/user.service.ts",
            "../../../outside",
            files
        );

        expect(result).toBeNull();
    });
});