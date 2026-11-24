
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createModuleResolver, resolveModule } from "../../src/core/graph/module-resolver";

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
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "./user.repository",
                files
            )
        ).toBe("src/user/user.repository.ts");
    });

    it("resolves an import with an explicit extension", () => {
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "./user.repository.ts",
                files
            )
        ).toBe("src/user/user.repository.ts");
    });

    it("resolves an index file", () => {
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "./",
                files
            )
        ).toBe("src/user/index.ts");
    });

    it("resolves parent directory imports", () => {
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "../database/database",
                files
            )
        ).toBe("src/database/database.ts");
    });

    it("returns null for missing modules", () => {
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "./missing",
                files
            )
        ).toBeNull();
    });

    it("does not resolve external packages", () => {
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "express",
                files
            )
        ).toBeNull();
    });

    it("does not resolve paths outside the repository", () => {
        expect(
            resolveModule(
                root,
                "src/user/user.service.ts",
                "../../../outside",
                files
            )
        ).toBeNull();
    });

    it("resolves wildcard path aliases from tsconfig", () => {
        const tempRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "codeops-test-")
        );

        try {
            fs.writeFileSync(
                path.join(tempRoot, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        baseUrl: ".",
                        paths: {
                            "@/*": ["src/*"]
                        }
                    }
                })
            );

            const resolver = createModuleResolver(
                tempRoot,
                [
                    "src/user/user.service.ts",
                    "src/shared/types.tsx"
                ]
            );

            expect(
                resolver.resolve(
                    "src/index.ts",
                    "@/user/user.service"
                )
            ).toBe("src/user/user.service.ts");

            expect(
                resolver.resolve(
                    "src/index.ts",
                    "@/shared/types"
                )
            ).toBe("src/shared/types.tsx");
        } finally {
            fs.rmSync(tempRoot, {
                recursive: true,
                force: true
            });
        }
    });

    it("resolves aliases without baseUrl", () => {
        const tempRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "codeops-test-")
        );

        try {
            fs.writeFileSync(
                path.join(tempRoot, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        paths: {
                            "@utils/*": ["src/utils/*"]
                        }
                    }
                })
            );

            const resolver = createModuleResolver(
                tempRoot,
                ["src/utils/helpers.ts"]
            );

            expect(
                resolver.resolve(
                    "src/index.ts",
                    "@utils/helpers"
                )
            ).toBe("src/utils/helpers.ts");
        } finally {
            fs.rmSync(tempRoot, {
                recursive: true,
                force: true
            });
        }
    });

    it("does not classify configured aliases as external", () => {
        const tempRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "codeops-test-")
        );

        try {
            fs.writeFileSync(
                path.join(tempRoot, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        paths: {
                            "@/*": ["src/*"]
                        }
                    }
                })
            );

            const resolver = createModuleResolver(
                tempRoot,
                ["src/utils/helpers.ts"]
            );

            expect(
                resolver.isLocalSpecifier("@/missing")
            ).toBe(true);

            expect(
                resolver.isLocalSpecifier("express")
            ).toBe(false);
        } finally {
            fs.rmSync(tempRoot, {
                recursive: true,
                force: true
            });
        }
    });
});