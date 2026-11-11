/**
 * Vibe test, step 3 of 3: score what the agents left behind.
 *
 *   bun run vibe:score            # newest run
 *   bun run vibe:score <run-dir>
 *
 * Every check is mechanical — no model grades another model. The same checks
 * run on every task, and a check that cannot apply (no reduced-motion rule in
 * the brief) is reported as "n/a", never as a pass.
 *
 *   copied   every shipped file exists somewhere in the project, unchanged
 *   types    `tsc --noEmit` passes on the project
 *   wired    the component is rendered and app/page.tsx was changed
 *   props    literal prop values sit inside the schema's range / options, and
 *            the values the request asked for are the values passed
 *   deps     every package the project imports is listed in package.json
 *   motion   when the brief carries the reduced-motion rule, `reducedMotion`
 *            is passed and is not a hardcoded literal
 *   tokens   when the source uses bench theme tokens, the project's CSS
 *            defines every one of them
 *
 * Not scored, because only a real build or a browser can see it: whether the
 * wrapper has a height, and whether a hook landed in a Server Component.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { requiredVariables, tokensUsed } from "../../lib/registry/bench-tokens";
import { getEntry } from "../../lib/registry/index";
import { getSource } from "../../lib/registry/source";
import type { ComponentEntry, PropValue } from "../../lib/registry/types";
import { FIXTURE_PAGE, REPO_ROOT, loadTasks, resolveRun, type Task } from "./shared";

type Verdict = "pass" | "fail" | "n/a";
interface Check {
  verdict: Verdict;
  /** Why it failed. Empty on a pass. */
  notes: string[];
}
const CHECKS = ["copied", "types", "wired", "props", "deps", "motion", "tokens"] as const;
type CheckName = (typeof CHECKS)[number];
type TaskScore = Record<CheckName, Check>;

const pass: Check = { verdict: "pass", notes: [] };
const fail = (...notes: string[]): Check => ({ verdict: "fail", notes });
const verdict = (notes: string[]): Check => (notes.length ? fail(...notes) : pass);

// ---------------------------------------------------------------- project files

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Text with everything an honest copy may change removed: whitespace, quote
 * style, semicolons, and import paths (the brief lets the component live
 * anywhere, which legitimately rewrites a specifier).
 */
function normalise(text: string): string {
  return text
    .replace(/\bfrom\s*["'][^"']*["']/g, "from")
    .replace(/["'`]/g, '"')
    .replace(/[\s;]/g, "");
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

// ----------------------------------------------------------------------- checks

type Passed = { literal: true; value: PropValue } | { literal: false };

function literalOf(init: ts.JsxAttribute["initializer"]): Passed {
  if (!init) return { literal: true, value: true };
  if (ts.isStringLiteral(init)) return { literal: true, value: init.text };
  if (!ts.isJsxExpression(init) || !init.expression) return { literal: false };
  const expr = init.expression;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return { literal: true, value: expr.text };
  }
  if (ts.isNumericLiteral(expr)) return { literal: true, value: Number(expr.text) };
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return { literal: true, value: -Number(expr.operand.text) };
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return { literal: true, value: true };
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return { literal: true, value: false };
  return { literal: false };
}

/** Every `<Tag … />` in a file, as a map of the attributes it was given. */
function usesOf(source: ts.SourceFile, tag: string): Array<Map<string, Passed>> {
  const out: Array<Map<string, Passed>> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(source) === tag
    ) {
      const attrs = new Map<string, Passed>();
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          attrs.set(attr.name.getText(source), literalOf(attr.initializer));
        }
      }
      out.push(attrs);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function importsOf(source: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function packageName(specifier: string): string | null {
  if (/^(\.|@\/|node:)/.test(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function checkProps(
  entry: ComponentEntry,
  task: Task,
  uses: Array<Map<string, Passed>>,
): Check {
  const notes: string[] = [];
  for (const attrs of uses) {
    for (const prop of entry.props) {
      const given = attrs.get(prop.name);
      if (!given?.literal) continue;
      const { value } = given;
      if (prop.kind === "number" && typeof value === "number") {
        if (value < prop.min || value > prop.max) {
          notes.push(`${prop.name}=${value} is outside ${prop.min}–${prop.max}`);
        }
      }
      if (prop.kind === "enum" && !prop.options.includes(String(value))) {
        notes.push(`${prop.name}="${value}" is not one of ${prop.options.join(" | ")}`);
      }
    }
  }
  for (const want of task.expect) {
    const hit = uses.some((attrs) => {
      const given = attrs.get(want.prop);
      return given?.literal === true && given.value === want.equals;
    });
    if (!hit) notes.push(`asked for ${want.prop}=${JSON.stringify(want.equals)}, not passed`);
  }
  return verdict(notes);
}

async function scoreTask(run: string, task: Task): Promise<TaskScore> {
  const dir = path.join(run, task.id);
  const entry = getEntry(task.slug);
  if (!entry) throw new Error(`${task.id}: no registry entry "${task.slug}"`);
  const shipped = await getSource(entry);
  if (shipped.status !== "ok") throw new Error(`${task.id}: source is ${shipped.status}`);

  const files = walk(dir).map((file) => {
    const text = readFileSync(file, "utf8");
    return { file, rel: path.relative(dir, file), text, norm: normalise(text) };
  });

  // copied — and, as a side effect, which files are the agent's own writing.
  const copiedNotes: string[] = [];
  const shippedCopies = new Set<string>();
  for (const want of shipped.files) {
    const norm = normalise(want.raw);
    const exact = files.find((file) => file.norm === norm);
    if (exact) {
      shippedCopies.add(exact.file);
      continue;
    }
    const base = path.basename(want.file);
    const renamed = files.find((file) => path.basename(file.file) === base);
    if (renamed) shippedCopies.add(renamed.file);
    copiedNotes.push(`${want.file}: ${renamed ? "changed" : "missing"}`);
  }

  const code = files.filter((file) => /\.tsx?$/.test(file.file));
  const authored = code.filter((file) => !shippedCopies.has(file.file));
  const sources = new Map(code.map((file) => [file.file, parse(file.file, file.text)]));

  // types
  const tsc = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", dir, "--pretty", "false"],
    { encoding: "utf8" },
  );
  const tscErrors = `${tsc.stdout}${tsc.stderr}`
    .split("\n")
    .filter((line) => /error TS\d+/.test(line));
  const types =
    tsc.status === 0
      ? pass
      : fail(...(tscErrors.length ? tscErrors.slice(0, 4) : ["tsc did not run"]));

  // wired
  const tag = entry.name.replace(/\s+/g, "");
  const uses = authored.flatMap((file) => usesOf(sources.get(file.file)!, tag));
  const page = files.find((file) => file.rel === path.join("app", "page.tsx"));
  const wiredNotes: string[] = [];
  if (uses.length === 0) wiredNotes.push(`<${tag}> is never rendered`);
  if (!page) wiredNotes.push("app/page.tsx is gone");
  else if (page.text === FIXTURE_PAGE) wiredNotes.push("app/page.tsx is untouched");

  // deps
  const pkgFile = path.join(dir, "package.json");
  const pkg = existsSync(pkgFile)
    ? (JSON.parse(readFileSync(pkgFile, "utf8")) as Record<string, Record<string, string>>)
    : {};
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const imported = new Set(
    [...sources.values()]
      .flatMap(importsOf)
      .map(packageName)
      .filter((name): name is string => name !== null),
  );
  const undeclared = [...imported].filter((name) => !declared.has(name)).sort();

  // motion — applies exactly when prompt.ts emits the rule (same substring test).
  const hasRule = shipped.files.some((file) => file.raw.includes("reducedMotion"));
  let motion: Check = { verdict: "n/a", notes: [] };
  if (hasRule) {
    const wiredUp = uses.some((attrs) => attrs.get("reducedMotion")?.literal === false);
    const hardcoded = uses.some((attrs) => attrs.get("reducedMotion")?.literal === true);
    motion = wiredUp
      ? pass
      : fail(hardcoded ? "reducedMotion is a hardcoded literal" : "reducedMotion is not passed");
  }

  // tokens — applies exactly when prompt.ts emits the section (same detector).
  const use = tokensUsed(shipped.files.map((file) => file.raw));
  const needed = requiredVariables(use);
  let tokens: Check = { verdict: "n/a", notes: [] };
  if (needed.length > 0 || use.custom.length > 0) {
    const css = files
      .filter((file) => file.file.endsWith(".css"))
      .map((file) => file.text)
      .join("\n");
    // Property and utility names are letters and hyphens, so they are regex-safe.
    const hasVariable = (name: string) => new RegExp(`${name}\\s*:`).test(css);
    const hasUtility = (name: string) => new RegExp(`@utility\\s+${name}\\b`).test(css);
    tokens = verdict([
      ...needed
        .filter((name) => !hasVariable(name))
        .map((name) => `${name} is not defined in any stylesheet`),
      ...use.custom
        .filter((name) => !hasUtility(name))
        .map((name) => `@utility ${name} is not defined in any stylesheet`),
    ]);
  }

  return {
    copied: verdict(copiedNotes),
    types,
    wired: verdict(wiredNotes),
    props: checkProps(entry, task, uses),
    deps: verdict(undeclared.map((name) => `${name} is imported but not in package.json`)),
    motion,
    tokens,
  };
}

// ----------------------------------------------------------------------- report

const run = resolveRun(process.argv[2]);
const { tasks: ids } = JSON.parse(readFileSync(path.join(run, "run.json"), "utf8")) as {
  tasks: string[];
};
const tasks = loadTasks().filter((task) => ids.includes(task.id));

const scores: Record<string, TaskScore> = {};
for (const task of tasks) scores[task.id] = await scoreTask(run, task);

const MARK: Record<Verdict, string> = { pass: "pass", fail: "FAIL", "n/a": "-" };
const width = Math.max(...tasks.map((task) => task.id.length));
console.log(`Run: ${run}\n`);
console.log(`${"task".padEnd(width)}  ${CHECKS.map((name) => name.padEnd(6)).join("  ")}`);
for (const task of tasks) {
  const row = CHECKS.map((name) => MARK[scores[task.id][name].verdict].padEnd(6));
  console.log(`${task.id.padEnd(width)}  ${row.join("  ")}`);
}

const clean = tasks.filter((task) =>
  CHECKS.every((name) => scores[task.id][name].verdict !== "fail"),
);
console.log(`\n${clean.length} of ${tasks.length} tasks clean.`);
for (const name of CHECKS) {
  const applicable = tasks.filter((task) => scores[task.id][name].verdict !== "n/a");
  const passed = applicable.filter((task) => scores[task.id][name].verdict === "pass");
  console.log(`  ${name.padEnd(6)}  ${passed.length}/${applicable.length}`);
}

const failures = tasks.flatMap((task) =>
  CHECKS.filter((name) => scores[task.id][name].verdict === "fail").map(
    (name) => `${task.id} · ${name}\n${scores[task.id][name].notes.map((note) => `    ${note}`).join("\n")}`,
  ),
);
if (failures.length > 0) console.log(`\nFailures\n\n${failures.join("\n\n")}`);

writeFileSync(path.join(run, "score.json"), `${JSON.stringify(scores, null, 2)}\n`);
