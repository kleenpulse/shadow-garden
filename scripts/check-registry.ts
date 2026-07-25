/**
 * Registry invariant check. Runs headless under plain `bun` — no Next, no DOM.
 *
 *   bun run check:registry
 *
 * Exits non-zero when any error-severity rule fails, so this is a real gate and
 * not advice (§V.V5). Warnings print but do not fail; they are invariants whose
 * violations are still being worked through.
 */
import { buildContext } from "./registry/context";
import { checkRegistry, hasErrors, type Violation } from "./registry/check";
import { RULES } from "./registry/rules";

const ctx = buildContext();
const violations = checkRegistry(ctx, RULES);

const errors = violations.filter((v) => v.severity === "error");
const warnings = violations.filter((v) => v.severity === "warn");

function where(v: Violation): string {
  if (v.slug && v.prop) return `${v.slug}.${v.prop}`;
  if (v.slug) return v.slug;
  return "registry";
}

function report(label: string, list: Violation[]) {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length})`);
  const byRule = new Map<string, Violation[]>();
  for (const v of list) {
    const bucket = byRule.get(v.rule) ?? [];
    bucket.push(v);
    byRule.set(v.rule, bucket);
  }
  for (const [rule, items] of byRule) {
    const what = RULES.find((r) => r.id === rule)?.what ?? "";
    console.log(`\n  ${rule} — ${what}`);
    for (const v of items) {
      console.log(`    ${where(v)}: ${v.detail}`);
    }
  }
}

report("WARN", warnings);
report("FAIL", errors);

const counts = `${ctx.registry.length} entries, ${ctx.registry.reduce(
  (n, e) => n + e.props.length,
  0,
)} props, ${RULES.length} rules`;

if (hasErrors(violations)) {
  console.log(
    `\n${counts} — ${errors.length} error(s)${
      warnings.length ? `, ${warnings.length} warning(s)` : ""
    }.\n`,
  );
  process.exit(1);
}

console.log(
  `\n${counts} — registry clean${
    warnings.length ? ` (${warnings.length} warning(s))` : ""
  }.\n`,
);
