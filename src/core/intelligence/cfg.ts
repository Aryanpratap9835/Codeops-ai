import ts from "typescript";
import type { SourceLocation } from "../parser/parser-types";
import type { CFGNode, CFGNodeType, ControlFlowGraph } from "./intelligence-types";

function getLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
    const start = node.getStart(sourceFile);
    const pos = sourceFile.getLineAndCharacterOfPosition(start);
    return {
        line: pos.line + 1,
        column: pos.character + 1,
        start,
        end: node.getEnd()
    };
}

export function buildCFG(
    functionDecl: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    filePath: string,
    sourceFile: ts.SourceFile
): ControlFlowGraph {
    const funcName = "name" in functionDecl && functionDecl.name
        ? functionDecl.name.getText(sourceFile)
        : "anonymous";

    const nodes: CFGNode[] = [];
    let nodeIdCounter = 0;

    function createNode(type: CFGNodeType, label: string, location: SourceLocation | null = null): CFGNode {
        const id = `cfg:${funcName}:${nodeIdCounter++}`;
        const node: CFGNode = {
            id,
            type,
            label,
            location,
            successors: [],
            predecessors: []
        };
        nodes.push(node);
        return node;
    }

    function addEdge(from: CFGNode, to: CFGNode): void {
        if (!from.successors.includes(to.id)) {
            from.successors.push(to.id);
        }
        if (!to.predecessors.includes(from.id)) {
            to.predecessors.push(from.id);
        }
    }

    const entryNode = createNode("entry", "Entry");
    const exitNode = createNode("exit", "Exit");

    function processStatements(
        statements: readonly ts.Statement[],
        initialPredecessors: CFGNode[]
    ): CFGNode[] {
        let currentPredecessors = initialPredecessors;

        for (const statement of statements) {
            const loc = getLocation(statement, sourceFile);

            if (ts.isIfStatement(statement)) {
                const branchLabel = `if (${statement.expression.getText(sourceFile)})`;
                const branch = createNode("branch", branchLabel, loc);

                for (const p of currentPredecessors) {
                    addEdge(p, branch);
                }

                // Process then branch
                const thenStatements = ts.isBlock(statement.thenStatement)
                    ? statement.thenStatement.statements
                    : [statement.thenStatement];
                const thenExits = processStatements(thenStatements, [branch]);

                // Process else branch
                let elseExits: CFGNode[] = [];
                if (statement.elseStatement) {
                    const elseStatements = ts.isBlock(statement.elseStatement)
                        ? statement.elseStatement.statements
                        : [statement.elseStatement];
                    elseExits = processStatements(elseStatements, [branch]);
                } else {
                    // Fallthrough when if condition is false
                    elseExits = [branch];
                }

                currentPredecessors = [...thenExits, ...elseExits];
            } else if (
                ts.isForStatement(statement) ||
                ts.isForOfStatement(statement) ||
                ts.isForInStatement(statement) ||
                ts.isWhileStatement(statement) ||
                ts.isDoStatement(statement)
            ) {
                const loopLabel = `loop (${statement.getText(sourceFile).slice(0, 30)})`;
                const loop = createNode("loop", loopLabel, loc);

                for (const p of currentPredecessors) {
                    addEdge(p, loop);
                }
                // Back-edge
                addEdge(loop, loop);

                const loopBody = ts.isBlock(statement.statement)
                    ? statement.statement.statements
                    : [statement.statement];

                processStatements(loopBody, [loop]);
                currentPredecessors = [loop];
            } else if (ts.isReturnStatement(statement)) {
                const ret = createNode("return", statement.getText(sourceFile), loc);
                for (const p of currentPredecessors) {
                    addEdge(p, ret);
                }
                addEdge(ret, exitNode);
                currentPredecessors = []; // Normal flow stops after return
            } else if (ts.isThrowStatement(statement)) {
                const thr = createNode("throw", statement.getText(sourceFile), loc);
                for (const p of currentPredecessors) {
                    addEdge(p, thr);
                }
                addEdge(thr, exitNode);
                currentPredecessors = []; // Normal flow stops after throw
            } else {
                const stmtNode = createNode("statement", statement.getText(sourceFile).slice(0, 40), loc);
                for (const p of currentPredecessors) {
                    addEdge(p, stmtNode);
                }
                currentPredecessors = [stmtNode];
            }
        }

        return currentPredecessors;
    }

    const body = functionDecl.body;

    if (!body) {
        addEdge(entryNode, exitNode);
        return {
            functionName: funcName,
            filePath,
            entryNodeId: entryNode.id,
            exitNodeId: exitNode.id,
            nodes,
            unreachableNodes: []
        };
    }

    if (ts.isBlock(body)) {
        const finalExits = processStatements(body.statements, [entryNode]);
        for (const p of finalExits) {
            addEdge(p, exitNode);
        }
    } else {
        const exprNode = createNode("return", body.getText(sourceFile).slice(0, 40), getLocation(body, sourceFile));
        addEdge(entryNode, exprNode);
        addEdge(exprNode, exitNode);
    }

    // Compute unreachable nodes via BFS from Entry
    const reachable = new Set<string>();
    const queue = [entryNode.id];

    while (queue.length > 0) {
        const currId = queue.shift()!;
        if (reachable.has(currId)) continue;
        reachable.add(currId);

        const currNode = nodes.find(n => n.id === currId);
        if (currNode) {
            for (const succ of currNode.successors) {
                if (!reachable.has(succ)) {
                    queue.push(succ);
                }
            }
        }
    }

    const unreachableNodes = nodes.filter(
        n => !reachable.has(n.id) && n.type !== "exit"
    );

    return {
        functionName: funcName,
        filePath,
        entryNodeId: entryNode.id,
        exitNodeId: exitNode.id,
        nodes,
        unreachableNodes
    };
}
