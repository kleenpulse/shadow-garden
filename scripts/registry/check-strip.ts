/**
 * Proves `stripComments()` only removes comments.
 *
 * The stripper is hand-rolled (see lib/registry/strip-comments.ts for why), and
 * a scanner bug there would silently mangle the exact bytes a paying customer
 * copies. So every file the registry can serve is parsed twice — before and
 * after — and the two token streams must match. TypeScript is a devDependency,
 * which is precisely why the check lives here and not in the request path.
 *
 * Run: bun run check:strip
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { stripComments } from "../../lib/registry/strip-comments";
import { registry } from "../../lib/registry/index";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Leaf tokens only — comments are trivia and never appear. JSX text is the one
 * token whose value carries layout: a whitespace-only run spanning a newline is
 * dropped by React itself, and dropping a comment-only line legitimately
 * changes it, so it is normalised rather than compared byte for byte.
 */
function tokens(source: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    // JSDoc is trivia the parser hangs on the node it documents, so it shows up
    // in getChildren() — it is a comment, and comments are what we are removing.
    if (
      node.kind >= ts.SyntaxKind.FirstJSDocNode &&
      node.kind <= ts.SyntaxKind.LastJSDocNode
    ) {
      return;
    }
    // `{/* … */}` parses as a JsxExpression with no expression — braces around a
    // comment, rendering nothing. The stripper takes the braces with the comment,
    // so the node is expected to vanish entirely.
    if (ts.isJsxExpression(node) && node.expression === undefined) return;
    const children = node.getChildren(source);
    if (children.length === 0) {
      const text = node.getText(source);
      if (node.kind === ts.SyntaxKind.JsxText) {
        if (/^\s*$/.test(text)) {
          // A run of spaces on one line is a rendered space and must survive.
          // A run spanning a newline is dropped by JSX, and so is the zero-width
          // JsxText the parser emits on each side of an expression container.
          if (text !== "" && !text.includes("\n")) out.push("jsx-space");
          return;
        }
        out.push(`jsx:${text.replace(/\s+/g, " ").trim()}`);
        return;
      }
      if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
      out.push(`${node.kind}:${text}`);
      return;
    }
    children.forEach(visit);
  };
  visit(source);
  return out;
}

/**
 * Comments left in the stripped output. Read off the parser's trivia rather than
 * a regex over the text — `Classified // Section VII` is rendered JSX copy, not
 * a comment, and only the parser knows the difference. Directives are expected
 * to survive; anything else means the stripper missed a shape.
 */
const DIRECTIVE =
  /^\s*(?:eslint[- ]|@ts-|prettier-ignore|biome-ignore|webpack[A-Z]|@vite-ignore|[#@]__PURE__|istanbul ignore|[cv]8 ignore|\/\s*<reference)/;

function survivors(source: ts.SourceFile, text: string): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  const visit = (node: ts.Node) => {
    const children = node.getChildren(source);
    if (children.length === 0) {
      // JsxText carries no trivia — its own body may contain `//` as copy.
      if (node.kind !== ts.SyntaxKind.JsxText) {
        for (const r of ts.getLeadingCommentRanges(text, node.getFullStart()) ??
          []) {
          if (seen.has(r.pos)) continue;
          seen.add(r.pos);
          const body = text.slice(r.pos + 2, r.end);
          if (!DIRECTIVE.test(body)) out.push(text.slice(r.pos, r.end));
        }
      }
      return;
    }
    children.forEach(visit);
  };
  visit(source);
  return out;
}

function syntaxErrors(file: string, text: string): string[] {
  const { diagnostics } = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  });
  return (diagnostics ?? []).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, " "),
  );
}

// The registry walk plus every file any entry actually declares as a variant.
// The second half is derived rather than listed: a peer file outside
// components/registry/ (lib/utils.ts, components/ui/auto-mask-vertical.tsx) is
// served through readVariant like any other, so it has to be strip-checked like
// any other — and deriving it means declaring a new peer can never open a hole
// here (§V41).
const files = [
  ...new Set([
    ...walk(path.join(ROOT, "components", "registry")),
    ...registry.flatMap((entry) =>
      entry.variants.map((v) => path.join(ROOT, ...v.file.split("/"))),
    ),
  ]),
].filter((file) => existsSync(file));

let failed = 0;
let stripped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const original = readFileSync(file, "utf8");
  const clean = stripComments(original);
  if (clean !== original) stripped++;

  const problems = syntaxErrors(rel, clean);
  if (problems.length > 0) {
    console.error(`✗ ${rel}\n    syntax: ${problems[0]}`);
    failed++;
    continue;
  }

  const before = tokens(parse(rel, original));
  const after = tokens(parse(rel, clean));
  const at = before.findIndex((tok, i) => tok !== after[i]);
  if (at !== -1 || before.length !== after.length) {
    const i = at === -1 ? Math.min(before.length, after.length) : at;
    console.error(
      `✗ ${rel}\n    token ${i}: expected ${before[i] ?? "<end>"}\n    got      ${after[i] ?? "<end>"}`,
    );
    failed++;
    continue;
  }

  for (const text of survivors(parse(rel, clean), clean)) {
    console.error(`✗ ${rel}\n    comment survived: ${text.slice(0, 72)}`);
    failed++;
  }
}

console.log(
  `${files.length - failed}/${files.length} files token-identical after stripping (${stripped} had comments)`,
);
if (failed > 0) process.exit(1);
