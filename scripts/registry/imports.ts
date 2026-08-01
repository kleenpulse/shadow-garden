import ts from "typescript";

// What one file imports, classified into the three things a customer has to do
// about it: install a package, copy an aliased file, or copy a sibling file.
//
// AST rather than text search, for two reasons. A mention inside a comment or a
// string does not count — several entries describe their old imports in a doc
// comment. And reading `.text` off the StringLiteral node is quote-agnostic:
// registry sources are a mix of single and double quotes (MarqueeText.tsx and
// auto-mask-horizontal.tsx are single), and a regex tuned to one of them
// under-reports without ever failing. Do not "optimise" this back to a regex.
//
// Pure over text, no fs — resolution and the transitive walk live in context.ts,
// which is the one place the check touches disk (§C5).

export type Specifier =
  /** A bare package. `name` is normalised to what you would `bun add`. */
  | { kind: "package"; name: string; raw: string }
  /** A `@/`-aliased repo file. */
  | { kind: "alias"; raw: string }
  /** A `./` or `../` sibling. */
  | { kind: "relative"; raw: string };

/**
 * `motion/react` → `motion`, `gsap/Flip` → `gsap`,
 * `three/examples/jsm/loaders/GLTFLoader.js` → `three`, `@scope/x/y` → `@scope/x`.
 * A subpath is not separately installable, so the install command needs the
 * package root — which is what every hand-authored `dependencies` array already
 * says.
 */
export function packageName(raw: string): string {
  const parts = raw.split("/");
  return raw.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function classify(raw: string): Specifier {
  // Order matters: a scoped package also starts with "@".
  if (raw.startsWith(".")) return { kind: "relative", raw };
  if (raw.startsWith("@/")) return { kind: "alias", raw };
  return { kind: "package", name: packageName(raw), raw };
}

/**
 * Every module specifier in a file, in source order. Covers `import`, bare
 * side-effect `import "x"`, `import type`, `export … from`, the `import("x")`
 * type node, and dynamic `import()`. `require()` is not used anywhere under
 * components/registry/, so it is deliberately not handled — add it here if that
 * ever changes rather than pattern-matching the call site elsewhere.
 *
 * Type-only imports are NOT filtered out: `import type { Row } from "./types"`
 * still means the customer has to copy that file, or their build fails.
 */
export function parseImports(fileName: string, text: string): Specifier[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const out: Specifier[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(classify(node.moduleSpecifier.text));
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      out.push(classify(node.argument.literal.text));
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push(classify(node.arguments[0].text));
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return out;
}
