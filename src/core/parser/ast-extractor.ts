
import ts from "typescript";

import {
    CallInfo,
    ClassInfo,
    ExportInfo,
    FunctionInfo,
    ImportInfo,
    ParseDiagnostic,
    ParsedFile,
    PropertyInfo,
    SourceLocation
} from "./parser-types";

function getLocation(
    node: ts.Node,
    sourceFile: ts.SourceFile
): SourceLocation {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const position = sourceFile.getLineAndCharacterOfPosition(start);

    return {
        line: position.line + 1,
        column: position.character + 1,
        start,
        end
    };
}

function getNodeName(node: ts.Node): string {
    return ts.isIdentifier(node) ||
        ts.isStringLiteral(node) ||
        ts.isNumericLiteral(node)
        ? node.text
        : node.getText();
}

function hasExportModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node)
        ? ts.getModifiers(node)
        : undefined;

    return modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false;
}

function hasDefaultModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node)
        ? ts.getModifiers(node)
        : undefined;

    return modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword
    ) ?? false;
}

function getParameters(
    parameters: ts.NodeArray<ts.ParameterDeclaration>
): string[] {
    return parameters.map(parameter => parameter.name.getText());
}

function getReturnType(
    node: ts.SignatureDeclaration
): string | null {
    return node.type?.getText() ?? null;
}

function extractFunctions(
    sourceFile: ts.SourceFile,
    functions: FunctionInfo[]
): void {
    function visit(node: ts.Node): void {
        if (ts.isFunctionDeclaration(node)) {
            functions.push({
                name: node.name?.text ?? "anonymous",
                kind: "function",
                parameters: getParameters(node.parameters),
                returnType: getReturnType(node),
                location: getLocation(node, sourceFile),
                exported: hasExportModifier(node)
            });
        }

        if (
            ts.isVariableDeclaration(node) &&
            node.initializer &&
            (ts.isArrowFunction(node.initializer) ||
                ts.isFunctionExpression(node.initializer))
        ) {
            const initializer = node.initializer;

            functions.push({
                name: getNodeName(node.name),
                kind: ts.isArrowFunction(initializer)
                    ? "arrow"
                    : "function-expression",
                parameters: getParameters(initializer.parameters),
                returnType: getReturnType(initializer),
                location: getLocation(node, sourceFile),
                exported: hasExportModifier(
                    node.parent.parent.parent
                )
            });
        }

        if (ts.isMethodDeclaration(node)) {
            functions.push({
                name: getNodeName(node.name),
                kind: "method",
                parameters: getParameters(node.parameters),
                returnType: getReturnType(node),
                location: getLocation(node, sourceFile),
                exported: false
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
}

function extractClasses(
    sourceFile: ts.SourceFile,
    classes: ClassInfo[]
): void {
    function visit(node: ts.Node): void {
        if (ts.isClassDeclaration(node)) {
            const methods: string[] = [];
            const properties: PropertyInfo[] = [];

            for (const member of node.members) {
                if (ts.isMethodDeclaration(member)) {
                    methods.push(getNodeName(member.name));
                }

                if (ts.isPropertyDeclaration(member)) {
                    properties.push({
                        name: getNodeName(member.name),
                        type: member.type?.getText() ?? null,
                        location: getLocation(member, sourceFile)
                    });
                }
            }

            classes.push({
                name: node.name?.text ?? "anonymous",
                methods,
                properties,
                location: getLocation(node, sourceFile),
                exported: hasExportModifier(node)
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
}

function extractImports(
    sourceFile: ts.SourceFile,
    imports: ImportInfo[]
): void {
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) {
            continue;
        }

        if (!ts.isStringLiteral(statement.moduleSpecifier)) {
            continue;
        }

        const clause = statement.importClause;

        let defaultImport: string | null = null;
        let namespaceImport: string | null = null;
        let namedImports: string[] = [];

        if (clause) {
            defaultImport = clause.name?.text ?? null;

            if (clause.namedBindings) {
                if (ts.isNamespaceImport(clause.namedBindings)) {
                    namespaceImport = clause.namedBindings.name.text;
                } else {
                    namedImports = clause.namedBindings.elements.map(
                        element => element.name.text
                    );
                }
            }
        }

        imports.push({
            moduleSpecifier: statement.moduleSpecifier.text,
            defaultImport,
            namespaceImport,
            namedImports,
            isTypeOnly: clause?.isTypeOnly ?? false,
            location: getLocation(statement, sourceFile)
        });
    }
}

function extractExports(
    sourceFile: ts.SourceFile,
    exports: ExportInfo[]
): void {
    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement)) {
            const moduleSpecifier =
                statement.moduleSpecifier &&
                    ts.isStringLiteral(statement.moduleSpecifier)
                    ? statement.moduleSpecifier.text
                    : null;

            if (
                statement.exportClause &&
                ts.isNamedExports(statement.exportClause)
            ) {
                for (const element of statement.exportClause.elements) {
                    exports.push({
                        name: element.name.text,
                        kind: "re-export",
                        isDefault: false,
                        moduleSpecifier,
                        location: getLocation(element, sourceFile)
                    });
                }
            } else {
                exports.push({
                    name: "*",
                    kind: "export-all",
                    isDefault: false,
                    moduleSpecifier,
                    location: getLocation(statement, sourceFile)
                });
            }

            continue;
        }

        if (ts.isExportAssignment(statement)) {
            exports.push({
                name: "default",
                kind: "default-export",
                isDefault: true,
                moduleSpecifier: null,
                location: getLocation(statement, sourceFile)
            });

            continue;
        }

        if (hasExportModifier(statement)) {
            const nameNode = "name" in statement ? (statement.name as ts.Node | undefined) : undefined;
            const name = nameNode && ts.isIdentifier(nameNode)
                ? nameNode.text
                : "default";

            exports.push({
                name,
                kind: ts.SyntaxKind[statement.kind],
                isDefault: hasDefaultModifier(statement),
                moduleSpecifier: null,
                location: getLocation(statement, sourceFile)
            });
        }
    }
}

function extractCalls(
    sourceFile: ts.SourceFile,
    calls: CallInfo[]
): void {
    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
            calls.push({
                callee: node.expression.getText(sourceFile),
                location: getLocation(node, sourceFile)
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
}

function extractDiagnostics(
    sourceFile: ts.SourceFile
): ParseDiagnostic[] {
    const diagnostics = (
        sourceFile as ts.SourceFile & {
            parseDiagnostics: readonly ts.Diagnostic[];
        }
    ).parseDiagnostics;

    return diagnostics.map(diagnostic => {
        let location: SourceLocation | null = null;

        if (diagnostic.start !== undefined) {
            const position =
                sourceFile.getLineAndCharacterOfPosition(
                    diagnostic.start
                );

            location = {
                line: position.line + 1,
                column: position.character + 1,
                start: diagnostic.start,
                end: diagnostic.start +
                    (diagnostic.length ?? 0)
            };
        }

        return {
            code: diagnostic.code,
            message: ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                "\n"
            ),
            location
        };
    });
}

export function extractAST(
    sourceFile: ts.SourceFile,
    filePath: string
): ParsedFile {
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const calls: CallInfo[] = [];

    extractFunctions(sourceFile, functions);
    extractClasses(sourceFile, classes);
    extractImports(sourceFile, imports);
    extractExports(sourceFile, exports);
    extractCalls(sourceFile, calls);

    return {
        filePath,
        functions,
        classes,
        imports,
        exports,
        calls,
        diagnostics: extractDiagnostics(sourceFile)
    };
}