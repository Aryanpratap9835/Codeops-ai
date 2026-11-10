
const ts = require("typescript");

const sourceCode = `
function add(a: number, b: number): number {
    return a + b;
}

const multiply = (a: number, b: number) => {
    return a * b;
};

class Calculator {
    subtract(a: number, b: number) {
        return a - b;
    }
}
`;

const source = ts.createSourceFile(
    "ast-demo.ts",
    sourceCode,
    ts.ScriptTarget.Latest,
    true
);

const functions = [];

function visit(node) {

    // 1. Normal function declarations
    if (ts.isFunctionDeclaration(node)) {
        functions.push({
            type: "FunctionDeclaration",
            name: node.name?.text ?? "anonymous",
            parameters: node.parameters.map(parameter =>
                parameter.name.getText(source)
            )
        });
    }

    // 2. Arrow functions
    if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isArrowFunction(node.initializer)
    ) {
        functions.push({
            type: "ArrowFunction",
            name: node.name.getText(source),
            parameters: node.initializer.parameters.map(parameter =>
                parameter.name.getText(source)
            )
        });
    }

    // 3. Class methods
    if (ts.isMethodDeclaration(node)) {
        functions.push({
            type: "MethodDeclaration",
            name: node.name.getText(source),
            parameters: node.parameters.map(parameter =>
                parameter.name.getText(source)
            )
        });
    }

    // Recursively visit child nodes
    ts.forEachChild(node, visit);
}

// Start AST traversal
visit(source);

// Display extracted metadata
console.log("Functions discovered:");
console.log(JSON.stringify(functions, null, 2));