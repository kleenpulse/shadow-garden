import ts from "typescript";

// Two static reads that close the gap between an entry and the preview that
// renders it. Both are pure over source text — the caller supplies the bytes.
//
// AST rather than regex on purpose: previews.ts mixes quoted and unquoted keys,
// and `values.` appears inside comments in at least one preview. The compiler
// already knows the difference. `typescript` is a devDependency, so this costs
// no new install and never reaches a browser bundle.

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Registered slug → the module specifier its preview is imported from, read off
 * the `previews` object literal in components/registry/previews.ts.
 *
 * The map cannot be imported at runtime: previews.ts is "use client" and calls
 * next/dynamic, neither of which survives outside Next.
 */
export function parsePreviewRegistrations(text: string): Map<string, string> {
  const source = parse("previews.ts", text);
  const out = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "previews" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : null;
        if (key === null) continue;
        out.set(key, findImportSpecifier(prop.initializer) ?? "");
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return out;
}

/** The specifier inside `dynamic(() => import("./x/Y"), …)`. */
function findImportSpecifier(node: ts.Node): string | null {
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found !== null) return;
    if (
      n.kind === ts.SyntaxKind.CallExpression &&
      (n as ts.CallExpression).expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = (n as ts.CallExpression).arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        found = arg.text;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Every `values.<name>` a preview reads. Comments and strings are excluded by
 * construction; computed access (`values[k]`) is reported separately because it
 * would defeat static extraction and no preview currently uses it.
 */
export function parseValueReads(fileName: string, text: string): {
  keys: Set<string>;
  dynamicAccess: boolean;
  usesPaused: boolean;
} {
  const source = parse(fileName, text);
  const keys = new Set<string>();
  let dynamicAccess = false;
  let usesPaused = false;

  const visit = (node: ts.Node): void => {
    // Any mention of the `paused` PreviewProps field. Previews forward it in
    // several shapes (`paused={paused}`, `const still = paused || reducedMotion`,
    // `speed={still ? 0 : …}`), so presence of the identifier is the signal.
    if (ts.isIdentifier(node) && node.text === "paused") {
      usesPaused = true;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "values"
    ) {
      keys.add(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "values"
    ) {
      dynamicAccess = true;
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return { keys, dynamicAccess, usesPaused };
}
