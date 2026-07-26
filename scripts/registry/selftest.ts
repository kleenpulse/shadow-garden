/**
 * Proves the rules detect. `bun run check:registry` passing tells you the repo is
 * clean; it does not tell you the rules can fail. This feeds checkRegistry a
 * synthetic context with one deliberate breakage per rule and asserts each one
 * fires — and that a clean context stays silent.
 *
 *   bun run check:registry:selftest
 *
 * No test runner needed: exit code is the assertion. This is what the injected
 * CheckContext buys — the rules never touch disk, so a fake registry is enough.
 */
import type { ComponentEntry } from "../../lib/registry/types";
import { checkRegistry, type CheckContext } from "./check";
import { RULES } from "./rules";

function entry(over: Partial<ComponentEntry> = {}): ComponentEntry {
  return {
    slug: "ok-entry",
    name: "OkEntry",
    category: "Backgrounds",
    tier: "free",
    description: "fine",
    props: [],
    variants: [
      {
        lang: "ts",
        style: "tailwind",
        file: "components/registry/ok-entry/OkEntry.tsx",
      },
    ],
    ...over,
  };
}

/** A preview that reads exactly the props the entry declares. */
function readsAll(registry: ComponentEntry[]) {
  return (slug: string) => ({
    registered: true,
    found: true,
    keys: new Set(
      registry.find((e) => e.slug === slug)?.props.map((p) => p.name) ?? [],
    ),
    dynamicAccess: false,
    usesPaused: registry.find((e) => e.slug === slug)?.pausable === true,
  });
}

function context(registry: ComponentEntry[], over: Partial<CheckContext> = {}): CheckContext {
  return {
    registry,
    dirs: new Set(registry.map((e) => e.slug)),
    fileExists: () => true,
    packageDeps: new Set(["ogl"]),
    previewKeys: new Set(registry.map((e) => e.slug)),
    previewReads: readsAll(registry),
    sourceDefaults: () => new Map(),
    loopUsage: () => ({ rafCalls: 0, resizeObservers: 0, usesHost: false, nullishHalts: 0 }),
    promptOverlays: new Set<string>(),
    ...over,
  };
}

const cases: Array<{ rule: string; ctx: CheckContext }> = [
  {
    rule: "slug-unique",
    ctx: context([entry(), entry()]),
  },
  {
    rule: "slug-matches-dir",
    ctx: context([entry()], { dirs: new Set<string>() }),
  },
  {
    rule: "variant-file-exists",
    ctx: context([entry()], { fileExists: () => false }),
  },
  {
    rule: "variant-file-root",
    ctx: context([
      entry({
        variants: [
          { lang: "ts", style: "tailwind", file: "lib/elsewhere/Thing.tsx" },
        ],
      }),
    ]),
  },
  {
    rule: "prop-names-unique",
    ctx: context([
      entry({
        props: [
          { name: "dup", kind: "boolean", default: true, description: "a" },
          { name: "dup", kind: "boolean", default: false, description: "b" },
        ],
      }),
    ]),
  },
  {
    // One rule, one table — but it must still catch each kind's own domain.
    rule: "default-in-domain",
    ctx: context([
      entry({
        props: [
          {
            name: "count",
            kind: "number",
            default: 99,
            min: 0,
            max: 10,
            description: "out of range",
          },
        ],
      }),
    ]),
  },
  {
    rule: "default-in-domain",
    ctx: context([
      entry({
        props: [
          {
            name: "mode",
            kind: "enum",
            default: "ghost",
            options: ["solid", "dashed"],
            description: "not an option",
          },
        ],
      }),
    ]),
  },
  {
    rule: "default-in-domain",
    ctx: context([
      entry({
        props: [
          {
            name: "tint",
            kind: "color",
            default: "rebeccapurple",
            description: "not a hex colour — the picker cannot render it",
          },
        ],
      }),
    ]),
  },
  {
    rule: "disabled-when-target",
    ctx: context([
      entry({
        props: [
          {
            name: "speed",
            kind: "number",
            default: 1,
            min: 0,
            max: 2,
            description: "gated on a prop that does not exist",
            disabledWhen: { prop: "nosuch", equals: true },
          },
        ],
      }),
    ]),
  },
  {
    rule: "added-at-format",
    ctx: context([entry({ addedAt: "25-07-2026" })]),
  },
  {
    rule: "prompt-overlay-slug",
    ctx: context([entry()], { promptOverlays: new Set(["not-a-slug"]) }),
  },
  {
    rule: "dependencies-declared",
    ctx: context([entry({ dependencies: ["not-a-real-package"] })]),
  },
  {
    rule: "preview-registered",
    ctx: context([entry()], {
      previewKeys: new Set<string>(),
      previewReads: () => ({
        registered: false,
        found: false,
        keys: new Set(),
        dynamicAccess: false,
        usesPaused: false,
      }),
    }),
  },
  {
    rule: "preview-reads-every-prop",
    ctx: context(
      [
        entry({
          props: [
            { name: "unread", kind: "boolean", default: true, description: "dead control" },
          ],
        }),
      ],
      {
        previewReads: () => ({
          registered: true,
          found: true,
          keys: new Set<string>(),
          dynamicAccess: false,
          usesPaused: false,
        }),
      },
    ),
  },
  {
    rule: "preview-reads-only-declared-props",
    ctx: context([entry()], {
      previewReads: () => ({
        registered: true,
        found: true,
        keys: new Set(["ghost"]),
        dynamicAccess: false,
        usesPaused: false,
      }),
    }),
  },
  {
    rule: "documented-default-matches-source",
    ctx: context(
      [
        entry({
          props: [
            {
              name: "count",
              kind: "number",
              default: 13,
              min: 0,
              max: 20,
              description: "documented 13, shipped 3",
            },
          ],
        }),
      ],
      {
        sourceDefaults: () =>
          new Map([["count", { kind: "literal", value: 3 }]]),
      },
    ),
  },
  {
    rule: "pausable-matches-preview",
    ctx: context([entry({ pausable: true })], {
      previewReads: () => ({
        registered: true,
        found: true,
        keys: new Set<string>(),
        dynamicAccess: false,
        usesPaused: false,
      }),
    }),
  },
  {
    rule: "no-hand-rolled-loop",
    ctx: context([entry()], {
      loopUsage: () => ({ rafCalls: 3, resizeObservers: 1, usesHost: false, nullishHalts: 0 }),
    }),
  },
  {
    rule: "loop-host-ships-the-hook",
    // Uses the host but declares only the component variant.
    ctx: context([entry()], {
      loopUsage: () => ({ rafCalls: 0, resizeObservers: 0, usesHost: true, nullishHalts: 0 }),
    }),
  },
  {
    // The freeze of §B.B7: an onFrame that coalesces its void draw to `false`.
    rule: "no-nullish-halt",
    ctx: context([entry()], {
      loopUsage: () => ({
        rafCalls: 0,
        resizeObservers: 0,
        usesHost: true,
        nullishHalts: 1,
      }),
    }),
  },
  {
    // The allowlist rule fires against the real repo, not a synthetic entry:
    // its whole job is to describe entries named in the two maps.
    rule: "loop-allowlist-current",
    ctx: context([entry({ slug: "physics-engine" })], {
      dirs: new Set(["physics-engine"]),
      previewKeys: new Set(["physics-engine"]),
      loopUsage: () => ({ rafCalls: 2, resizeObservers: 1, usesHost: false, nullishHalts: 0 }),
    }),
  },
];

let failed = 0;

// Every rule must have a case, or a rule could rot undetected.
const covered = new Set(cases.map((c) => c.rule));
for (const rule of RULES) {
  if (!covered.has(rule.id)) {
    console.log(`UNCOVERED  ${rule.id} — no selftest case`);
    failed++;
  }
}

for (const { rule, ctx } of cases) {
  const fired = checkRegistry(ctx, RULES).map((v) => v.rule);
  if (!fired.includes(rule)) {
    console.log(`MISS       ${rule} — did not fire on its broken context`);
    failed++;
  } else {
    console.log(`detects    ${rule}`);
  }
}

const cleanViolations = checkRegistry(context([entry()]), RULES);
if (cleanViolations.length > 0) {
  console.log(
    `FALSE POSITIVE on a clean entry: ${cleanViolations
      .map((v) => v.rule)
      .join(", ")}`,
  );
  failed++;
} else {
  console.log("detects    nothing on a clean entry");
}

if (failed > 0) {
  console.log(`\n${failed} selftest failure(s).\n`);
  process.exit(1);
}

console.log(`\n${RULES.length} rules, all proven to detect.\n`);
