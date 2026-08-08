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
import type { Collection } from "../../lib/collections";
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
        file: "components/registry/ok-entry/ok-entry.tsx",
      },
    ],
    ...over,
  };
}

/**
 * A collection that passes every collection rule against the entries below.
 * The intro is padded to clear the 40-word floor — the rules count words, not
 * meaning, so filler is the honest way to say "this axis is not what's broken".
 */
const PADDING = Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ");

function collection(over: Partial<Collection> = {}): Collection {
  return {
    slug: "ok-collection",
    title: "Ok Collection",
    intro: PADDING,
    filter: { kind: "category", category: "Backgrounds" },
    ...over,
  };
}

/** Enough distinct entries for a collection to clear COLLECTION_FLOOR. */
function fiveEntries(over: Partial<ComponentEntry> = {}): ComponentEntry[] {
  return Array.from({ length: 5 }, (_, i) =>
    entry({ slug: `ok-entry-${i}`, ...over }),
  );
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
    // Empty by default: the real manifest resolved against a one-entry synthetic
    // registry would fail every floor check, so each collection case supplies its
    // own. An empty manifest is trivially clean, which is what the clean-entry
    // assertion at the bottom needs.
    collections: [],
    dirs: new Set(registry.map((e) => e.slug)),
    fileExists: () => true,
    packageDeps: new Set(["ogl"]),
    previewKeys: new Set(registry.map((e) => e.slug)),
    previewReads: readsAll(registry),
    sourceDefaults: () => new Map(),
    loopUsage: () => ({ rafCalls: 0, resizeObservers: 0, usesHost: false, nullishHalts: 0 }),
    filterRegions: () => ({ displacementFilters: 0, unpinned: [] }),
    // Seeded with the framework packages on purpose: the clean-entry assertion
    // below then doubles as the proof that FRAMEWORK_PROVIDED still exempts
    // them. If someone ever makes the rule demand `react` in dependencies, this
    // fires as a false positive rather than passing quietly.
    entryImports: () => ({
      packages: new Set(["react", "react-dom"]),
      files: new Set<string>(),
      via: new Map<string, string>(),
      unresolved: [],
    }),
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
    rule: "variant-file-kebab",
    ctx: context([
      entry({
        variants: [
          { lang: "ts", style: "tailwind", file: "components/registry/thing/Thing.tsx" },
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
    rule: "cookbook-term-exists",
    ctx: context([entry({ cookbook: ["Not A Real Term"] })]),
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
    // The direction dependencies-declared cannot see: the package exists, the
    // source imports it, the entry never says so.
    rule: "imported-package-declared",
    ctx: context([entry()], {
      entryImports: () => ({
        packages: new Set(["ogl"]),
        files: new Set<string>(),
        via: new Map<string, string>(),
        unresolved: [],
      }),
    }),
  },
  {
    // Reached transitively, which is the case a one-file import scan misses.
    rule: "imported-file-ships",
    ctx: context([entry()], {
      entryImports: () => ({
        packages: new Set<string>(),
        files: new Set(["lib/utils.ts"]),
        via: new Map([["lib/utils.ts", "components/registry/ok-entry/sibling.tsx"]]),
        unresolved: [],
      }),
    }),
  },
  {
    rule: "imported-file-resolves",
    ctx: context([entry()], {
      entryImports: () => ({
        packages: new Set<string>(),
        files: new Set<string>(),
        via: new Map<string, string>(),
        unresolved: [
          { raw: "./Gone", from: "components/registry/ok-entry/ok-entry.tsx" },
        ],
      }),
    }),
  },
  {
    // Over-declaration: billed to the customer, never loaded. The default
    // entryImports ships no packages, so declaring one is enough to trip it.
    rule: "declared-package-imported",
    ctx: context([entry({ dependencies: ["ogl"] })]),
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
    // The ghost frame of §B18/§B20: a displacing filter left on the default
    // 120% region, so the skirt reads transparent black as maximum push.
    rule: "displacement-filter-region-pinned",
    ctx: context([entry()], {
      filterRegions: () => ({
        displacementFilters: 1,
        unpinned: ["x, y, width, height"],
      }),
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
    // The allowlist rule can only fire on a slug one of the two maps actually
    // names, so this borrows a real one. It used to borrow physics-engine out
    // of PENDING_MIGRATION; that map is empty now that the migration landed,
    // which left the rule uncovered — so this exercises the other branch
    // instead: a NOT_A_LOOP resident that has stopped using either primitive
    // and should therefore be taken off the list.
    rule: "loop-allowlist-current",
    ctx: context([entry({ slug: "marquee-text" })], {
      dirs: new Set(["marquee-text"]),
      previewKeys: new Set(["marquee-text"]),
      loopUsage: () => ({ rafCalls: 0, resizeObservers: 0, usesHost: false, nullishHalts: 0 }),
    }),
  },
  {
    rule: "collection-slug",
    ctx: context(fiveEntries(), {
      collections: [collection({ slug: "Not Kebab Case" })],
    }),
  },
  {
    // Filter is fine, registry is just too small to justify the page.
    rule: "collection-floor",
    ctx: context([entry()], { collections: [collection()] }),
  },
  {
    rule: "collection-terms",
    ctx: context(fiveEntries({ cookbook: ["Loop"] }), {
      collections: [
        collection({ filter: { kind: "terms", terms: ["Not A Real Term"] } }),
      ],
    }),
  },
  {
    rule: "collection-deps",
    ctx: context(fiveEntries({ dependencies: ["ogl"] }), {
      collections: [
        collection({ filter: { kind: "deps", packages: ["never-installed"] } }),
      ],
    }),
  },
  {
    rule: "collection-intro",
    ctx: context(fiveEntries(), {
      collections: [collection({ intro: "Too short." })],
    }),
  },
  {
    // Prose claiming a membership the filter does not resolve. Padded past the
    // 40-word floor so collection-intro is not what fires here.
    rule: "collection-intro-count",
    ctx: context(fiveEntries(), {
      collections: [collection({ intro: `Ten components ${PADDING}` })],
    }),
  },
  {
    // Two filters, one membership — the near-duplicate this rule exists to catch.
    rule: "collection-overlap",
    ctx: context(fiveEntries(), {
      collections: [
        collection({ slug: "by-category" }),
        collection({ slug: "by-tier", filter: { kind: "tier", tier: "free" } }),
      ],
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

// The trap collection-intro-count is shaped around, and the one direction the
// case list above cannot prove: a sub-count reads exactly like a membership
// claim. `react-webgl-backgrounds` ships this sentence for real, so a rule that
// fires on it would be worse than no rule at all.
const subCount = checkRegistry(
  context(fiveEntries(), {
    collections: [
      collection({
        intro: `Five components that render on the GPU. Three components use Three.js. ${PADDING}`,
      }),
    ],
  }),
  RULES,
).map((v) => v.rule);

if (subCount.includes("collection-intro-count")) {
  console.log(
    "FALSE POSITIVE  collection-intro-count — fired on a correct claim beside a sub-count",
  );
  failed++;
} else {
  console.log("detects    nothing on a sub-count beside a correct claim");
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
