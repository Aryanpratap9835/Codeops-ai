
export interface SourceLocation {
    line: number;
    column: number;
    start: number;
    end: number;
}

export type FunctionKind =
    | "function"
    | "arrow"
    | "function-expression"
    | "method";

export interface FunctionInfo {
    name: string;
    kind: FunctionKind;
    parameters: string[];
    returnType: string | null;
    location: SourceLocation;
    exported: boolean;
}

export interface PropertyInfo {
    name: string;
    type: string | null;
    location: SourceLocation;
}

export interface ClassInfo {
    name: string;
    methods: string[];
    properties: PropertyInfo[];
    location: SourceLocation;
    exported: boolean;
}

export interface ImportInfo {
    moduleSpecifier: string;
    defaultImport: string | null;
    namespaceImport: string | null;
    namedImports: string[];
    isTypeOnly: boolean;
    location: SourceLocation;
}

export interface ExportInfo {
    name: string;
    kind: string;
    isDefault: boolean;
    moduleSpecifier: string | null;
    location: SourceLocation;
}

export interface CallInfo {
    callee: string;
    location: SourceLocation;
}

export interface ParseDiagnostic {
    code: number;
    message: string;
    location: SourceLocation | null;
}

export interface ParsedFile {
    filePath: string;
    functions: FunctionInfo[];
    classes: ClassInfo[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    calls: CallInfo[];
    diagnostics: ParseDiagnostic[];
}

export interface ParseError {
    filePath: string;
    code: string;
    message: string;
}

export interface ParseResult {
    files: ParsedFile[];
    errors: ParseError[];
}