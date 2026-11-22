export interface SourceLocation {
    line: number;
    column: number;
    start: number;
    end: number;
}

export type FunctionKind = "function" | "arrow" | "function-expression" | "method";

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

export interface ImportBinding {
    importedName: string;
    localName: string;
}

export interface ImportInfo {
    moduleSpecifier: string;
    defaultImport: string | null;
    namespaceImport: string | null;
    namedImports: string[];
    namedImportBindings?: ImportBinding[];
    isTypeOnly: boolean;
    location: SourceLocation;
}

export interface ExportInfo {
    name: string;
    kind: string;
    isDefault: boolean;
    moduleSpecifier: string | null;
    localName?: string | null;
    location: SourceLocation;
}

export type CalleeKind = "identifier" | "property" | "element" | "other";

export interface CallInfo {
    callerId: string | null;
    callerName: string | null;
    callerQualifiedName?: string | null;
    callee: string;
    calleeKind: CalleeKind;
    isOptional: boolean;
    location: SourceLocation;
}

export interface ParseDiagnostic {
    code: number;
    message: string;
    location: SourceLocation | null;
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

export type SymbolKind = "function" | "class" | "method" | "property";

export interface SymbolInfo {
    id: string;
    name: string;
    qualifiedName: string;
    kind: SymbolKind;
    filePath: string;
    location: SourceLocation;
    exported: boolean;
    parentId: string | null;
}

export interface ParsedFile {
    filePath: string;
    functions: FunctionInfo[];
    classes: ClassInfo[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    calls: CallInfo[];
    symbols: SymbolInfo[];
    diagnostics: ParseDiagnostic[];
}
