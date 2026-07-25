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
  /**
   * `onFrame` bodies that coalesce a nullish value to `false` — `x ?? false`
   * or `x || false`. The draw functions return `void | false`, so a frame that
   * drew successfully returns `undefined`; coalescing that to `false` hands the
   * host its halt signal on every good frame. Nineteen entries shipped frozen
   * this way (§B.B7).
   */
  nullishHalts: number;
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
  let nullishHalts = 0;

  // `?? false` / `|| false` anywhere inside an `onFrame` property's value.
  // Scoped to onFrame because the same expression is perfectly reasonable
  // elsewhere — it is only a bug where `undefined` means "carry on".
  const countNullishHalts = (node: ts.Node): number => {
    let found = 0;
    const walk = (n: ts.Node) => {
      if (
        ts.isBinaryExpression(n) &&
        (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          n.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        n.right.kind === ts.SyntaxKind.FalseKeyword
      ) {
        found++;
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
    return found;
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "onFrame"
    ) {
      nullishHalts += countNullishHalts(node.initializer);
    }

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
  return { rafCalls, resizeObservers, usesHost, nullishHalts };
}
