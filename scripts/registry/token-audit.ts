// Design tokens that a template references but nothing resolves.
//
// This module exists because of §B29, the single worst defect the section has
// shipped: a mechanical port left `bg-background`, `text-foreground` and forty-five
// other utilities in their original form. Those names came from the source
// project's `@theme` block, which is global by construction and could not travel
// with the template (§V56). Tailwind emitted no rule for any of them — not a wrong
// colour, no declaration at all — and the page rendered with the host's colours,
// looking like a washed-out imitation of the design it was ported from.
//
// Nothing caught it. It type-checked, it passed every registry rule, it built, it
// rendered, and the only symptom was a human saying "this looks like a knock-off".
// That is precisely the failure shape an invariant is for (§V68).
//
// The same pass catches the sibling defect: a `var(--x)` reference to a variable
// nothing declares, which is equally silent and equally fatal to the look.

/**
 * Semantic colour tokens that shadcn-derived projects declare in their own
 * `@theme`. Every source project in this section is shadcn-flavoured, so this list
 * is the actual shape of the risk rather than a guess at it.
 *
 * A denylist, deliberately, rather than validating every utility against Tailwind's
 * full built-in palette: `bg-neutral-200`, `text-sm` and `border-2` are all legal
 * and all share these prefixes, so a general check would be mostly false positives.
 * These seventeen names are the ones that look right, compile to nothing, and are
 * never what a template means.
 */
const SEMANTIC_TOKENS = [
  "muted-foreground",
  "card-foreground",
  "primary-foreground",
  "secondary-foreground",
  "accent-foreground",
  "popover-foreground",
  "destructive-foreground",
  "background",
  "foreground",
  "secondary",
  "destructive",
  "popover",
  "primary",
  "border",
  "muted",
  "card",
  "input",
];

const UTIL_PREFIXES =
  "bg|text|border|from|via|to|fill|stroke|ring|decoration|outline|shadow|divide|placeholder|caret|accent";

/**
 * Bare semantic utilities — the ones that silently produce no CSS.
 *
 * Built with String.raw. A plain template literal turns `\b` into U+0008 BACKSPACE
 * and the pattern then matches nothing, which is exactly the bug that let §B29
 * through: the conversion script's rewrite silently did nothing and reported
 * success. The guard against that mistake is written the one way that cannot
 * repeat it.
 *
 * Two lookaheads exclude the forms that are already correct. `(?!-)` stops
 * `bg-card` matching inside `bg-card-foreground` (handled by its own longer entry),
 * and `(?!\])` skips the arbitrary-value rewrite `bg-[var(--background)]`, whose
 * token is followed by a closing bracket.
 */
export function findDeadUtilities(text: string): string[] {
  const out: string[] = [];
  for (const token of SEMANTIC_TOKENS) {
    const re = new RegExp(
      String.raw`\b((?:${UTIL_PREFIXES})-${token})\b(?!-)(?!\])`,
      "g",
    );
    for (const match of text.matchAll(re)) out.push(match[1]!);
  }
  return out;
}

/** Every `--custom-property` this text DECLARES. */
export function findDeclaredVars(text: string, isCss: boolean): string[] {
  const out: string[] = [];
  if (isCss) {
    for (const match of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
      out.push(match[1]!);
    }
    return out;
  }
  // next/font writes its family onto a variable named here rather than in CSS, so
  // a .tsx file is legitimately the declaration site for something only CSS reads.
  for (const match of text.matchAll(/variable:\s*["'](--[a-zA-Z0-9_-]+)["']/g)) {
    out.push(match[1]!);
  }
  // `el.style.setProperty("--x", …)` is the imperative half of the same contract,
  // and the mirror of the `getPropertyValue` read below. A cursor that sizes itself
  // from JS declares its variable this way and no other; treating that as
  // undeclared is a false positive, which is worse than no rule at all.
  for (const match of text.matchAll(
    /setProperty\(\s*["'](--[a-zA-Z0-9_-]+)["']/g,
  )) {
    out.push(match[1]!);
  }
  // Inline style objects can carry custom properties too: style={{ "--x": v }}.
  for (const match of text.matchAll(/["'](--[a-zA-Z0-9_-]+)["']\s*:/g)) {
    out.push(match[1]!);
  }
  return out;
}

/**
 * Every `--custom-property` this text READS.
 *
 * The name is captured with `*` and without requiring the closing paren on purpose.
 * A mangled reference like `var(--font-[family-name:var(--font-display)])` — which
 * is what a bad rewrite actually produced (§B30) — should surface as the
 * unresolvable `--font-` it really is, not be skipped for failing to look like a
 * well-formed reference.
 */
export function findReferencedVars(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9_-]*)/g)) {
    out.push(match[1]!);
  }
  // getComputedStyle(el).getPropertyValue("--x") is the same question asked in JS,
  // and fails the same silent way — it returns "" rather than throwing.
  for (const match of text.matchAll(
    /getPropertyValue\(\s*["'](--[a-zA-Z0-9_-]*)["']/g,
  )) {
    out.push(match[1]!);
  }
  return out;
}

/**
 * Namespaces a template may read without declaring.
 *
 * `--sg-` is the host's live token channel: the bench sets those on the wrapper at
 * runtime, and a template reading one with a fallback is the documented contract
 * (§I.msg). `--tw-` and `--radix-` are written by machinery rather than by hand.
 */
export const AMBIENT_VAR_PREFIXES = ["--sg-", "--tw-", "--radix-"];

export function isAmbientVar(name: string): boolean {
  return AMBIENT_VAR_PREFIXES.some((prefix) => name.startsWith(prefix));
}
