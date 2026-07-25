import ts from "typescript";

// Extracts the destructuring defaults a registry component actually ships, so the
// documented default (PropSchema.default) can be compared against the value a
// customer gets when they paste the file (§C4).
//
// This is the expensive pass, and it is deliberately conservative: anything it
// cannot resolve to a literal is reported as `unresolved` rather than guessed at.
// A wrong "drift" claim is worse than a missing one — it would train people to
// ignore the check.
//
// Three shapes are in use across the registry, and defaults do not always live on
// the component:
//   const X: React.FC<XProps> = ({ a = 1 }) => …
//   export default function X({ a = 1 }: XProps) …
//   export function useX({ a = 1 }: Opts = {}) …      ← BorderGlow keeps them here
// So every function-like in the module is scanned and its binding defaults merged,
// first declaration wins.

export type SourceDefault =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "unresolved"; text: string };

export function parseSourceDefaults(
  fileName: string,
  text: string,
): Map<string, SourceDefault> {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const consts = moduleConsts(source);
  const out = new Map<string, SourceDefault>();

  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      for (const param of node.parameters) {
        if (!ts.isObjectBindingPattern(param.name)) continue;
        for (const element of param.name.elements) {
          if (!element.initializer) continue;
          if (!ts.isIdentifier(element.name)) continue;
          const name = element.name.text;
          if (out.has(name)) continue; // first declaration wins
          out.set(name, resolve(element.initializer, consts, source));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return out;
}

function isFunctionLike(
  node: ts.Node,
): node is
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/** Module-level `const NAME = <literal>` bindings, for `raysColor = DEFAULT_COLOR`. */
function moduleConsts(source: ts.SourceFile): Map<string, ts.Expression> {
  const out = new Map<string, ts.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        out.set(decl.name.text, decl.initializer);
      }
    }
  }
  return out;
}

function resolve(
  expr: ts.Expression,
  consts: Map<string, ts.Expression>,
  source: ts.SourceFile,
  depth = 0,
): SourceDefault {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return { kind: "literal", value: expr.text };
  }
  if (ts.isNumericLiteral(expr)) {
    return { kind: "literal", value: Number(expr.text) };
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: "literal", value: true };
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "literal", value: false };
  }
  // Negative numbers are a prefix unary op, not a numeric literal.
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return { kind: "literal", value: -Number(expr.operand.text) };
  }
  // One hop through a module-level const, e.g. `raysColor = DEFAULT_COLOR`.
  if (ts.isIdentifier(expr) && depth < 4) {
    const target = consts.get(expr.text);
    if (target) return resolve(target, consts, source, depth + 1);
  }
  return { kind: "unresolved", text: expr.getText(source).replace(/\s+/g, " ") };
}

/**
 * Whether a documented default and a shipped default agree. Numbers compare
 * numerically (`saturation = 1.0` vs `default: 1`); everything else compares by
 * value. Case-insensitive for hex colours, which are written both ways.
 */
export function defaultsAgree(
  documented: string | number | boolean,
  shipped: string | number | boolean,
): boolean {
  if (typeof documented === "number" || typeof shipped === "number") {
    return Number(documented) === Number(shipped);
  }
  if (typeof documented === "string" && typeof shipped === "string") {
    if (/^#[0-9a-f]{3,8}$/i.test(documented) && /^#[0-9a-f]{3,8}$/i.test(shipped)) {
      return documented.toLowerCase() === shipped.toLowerCase();
    }
    return documented === shipped;
  }
  return documented === shipped;
}
