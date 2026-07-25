import ts from "typescript";

// Detects hand-rolled animation-runtime primitives in a registry component.
// AST rather than text search, so a mention inside a comment or a string does
// not count — several entries describe their old loop in a doc comment.

export interface LoopUsage {
  /** `requestAnimationFrame(…)` or `window.requestAnimationFrame(…)` calls. */
  rafCalls: number;
  /** `new ResizeObserver(…)` constructions. */
  resizeObservers: number;
  /** Imports the shared runtime host. */
  usesHost: boolean;
}

export function parseLoopUsage(fileName: string, text: string): LoopUsage {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  let rafCalls = 0;
  let resizeObservers = 0;
  let usesHost = false;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text.endsWith("use-animation-loop")) usesHost = true;
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (name === "requestAnimationFrame") rafCalls++;
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "ResizeObserver"
    ) {
      resizeObservers++;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return { rafCalls, resizeObservers, usesHost };
}
