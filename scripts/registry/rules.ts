import type { CheckContext, Finding, Rule } from "./check";
import { defaultsAgree } from "./source-defaults";
import { validateDefault } from "../../lib/registry/kinds";
import { COOKBOOK_TERMS } from "../../lib/cookbook";
import { collectionTerms, resolveCollection } from "../../lib/collections";

// The cheap rules — pure data plus one readdir and one package.json read. Each
// one closes an invariant that used to fail silently at runtime: a wrong entry
// still built, still rendered, and only showed up if someone dragged the right
// slider (§V.V6, V7, V9).
//
// The expensive rules (preview read-keys, documented-vs-shipped defaults) need a
// TypeScript pass and arrive in T11/T12.

/**
 * Roots getSource() can resolve a variant against. `hooks/` carries the
 * animation runtime host, shipped as a peer file alongside the component (§C1b).
 * Keep in sync with ROOTS in lib/registry/source.ts.
 */
const VARIANT_ROOTS = ["components/registry/", "hooks/"];

/**
 * Individual files outside those roots that getSource() will still resolve — a
 * shared util the component imports, which the customer therefore has to copy.
 * Exact paths, not a `lib/` root: see the rationale on PEER_FILES in
 * lib/registry/source.ts. Keep the two lists in sync (rules.ts cannot import
 * source.ts — it is `server-only` and wraps react.cache).
 */
const PEER_FILES = ["lib/utils.ts", "components/ui/auto-mask-vertical.tsx"];

/** A variant path getSource() can resolve: inside a root, or an exact peer file. */
function resolvableVariantFile(file: string): boolean {
  return (
    PEER_FILES.includes(file) || VARIANT_ROOTS.some((root) => file.startsWith(root))
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const slugUnique: Rule = {
  id: "slug-unique",
  severity: "error",
  what: "every entry slug appears exactly once across the four category files",
  run(ctx) {
    const seen = new Map<string, number>();
    for (const entry of ctx.registry) {
      seen.set(entry.slug, (seen.get(entry.slug) ?? 0) + 1);
    }
    return [...seen]
      .filter(([, n]) => n > 1)
      .map(([slug, n]) => ({
        slug,
        detail: `declared ${n} times — getEntry() resolves the first, the rest are unreachable`,
      }));
  },
};

const slugMatchesDir: Rule = {
  id: "slug-matches-dir",
  severity: "error",
  what: "every slug has a matching directory under components/registry/",
  run(ctx) {
    return ctx.registry
      .filter((entry) => !ctx.dirs.has(entry.slug))
      .map((entry) => ({
        slug: entry.slug,
        detail: `no components/registry/${entry.slug}/ directory`,
      }));
  },
};

const variantFileExists: Rule = {
  id: "variant-file-exists",
  severity: "error",
  what: "every variant.file resolves to a real file on disk",
  run(ctx) {
    return eachVariant(ctx, (entry, file) =>
      ctx.fileExists(file)
        ? null
        : {
            slug: entry.slug,
            detail: `variant file not on disk: ${file} — the Code tab renders "Source pending"`,
          },
    );
  },
};

const variantFileRoot: Rule = {
  id: "variant-file-root",
  severity: "error",
  what: "every variant.file sits under a root getSource() can resolve",
  run(ctx) {
    return eachVariant(ctx, (entry, file) =>
      resolvableVariantFile(file)
        ? null
        : {
            slug: entry.slug,
            detail: `variant file outside ${VARIANT_ROOTS.join(" | ")} and not a known peer file: ${file}`,
          },
    );
  },
};

const propNamesUnique: Rule = {
  id: "prop-names-unique",
  severity: "error",
  what: "prop names are unique within an entry",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const seen = new Map<string, number>();
      for (const prop of entry.props) {
        seen.set(prop.name, (seen.get(prop.name) ?? 0) + 1);
      }
      for (const [name, n] of seen) {
        if (n > 1) {
          out.push({
            slug: entry.slug,
            prop: name,
            detail: `declared ${n} times — the later control overwrites the earlier`,
          });
        }
      }
    }
    return out;
  },
};

const defaultInDomain: Rule = {
  id: "default-in-domain",
  severity: "error",
  what: "every prop's documented default lies inside its own domain",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      for (const prop of entry.props) {
        // What "inside its domain" means per kind is the kind table's business,
        // so the bench and the check can never disagree about a valid default.
        const problem = validateDefault(prop);
        if (problem) out.push({ slug: entry.slug, prop: prop.name, detail: problem });
      }
    }
    return out;
  },
};

const disabledWhenTarget: Rule = {
  id: "disabled-when-target",
  severity: "error",
  what: "disabledWhen.prop names another prop on the same entry",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const names = new Set(entry.props.map((p) => p.name));
      for (const prop of entry.props) {
        const target = prop.disabledWhen?.prop;
        if (!target) continue;
        if (!names.has(target)) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: `disabledWhen targets "${target}", which is not a prop on this entry — the control never disables`,
          });
        } else if (target === prop.name) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: "disabledWhen targets itself",
          });
        }
      }
    }
    return out;
  },
};

const addedAtFormat: Rule = {
  id: "added-at-format",
  severity: "error",
  what: "addedAt is a parseable YYYY-MM-DD date",
  run(ctx) {
    return ctx.registry
      .filter((entry) => entry.addedAt !== undefined)
      .filter(
        (entry) =>
          !ISO_DATE.test(entry.addedAt as string) ||
          Number.isNaN(Date.parse(entry.addedAt as string)),
      )
      .map((entry) => ({
        slug: entry.slug,
        detail: `addedAt "${entry.addedAt}" is not a parseable YYYY-MM-DD date — the New badge silently never appears`,
      }));
  },
};

const cookbookTermExists: Rule = {
  id: "cookbook-term-exists",
  severity: "error",
  what: "every cited cookbook term is defined in lib/cookbook.ts",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      for (const term of entry.cookbook ?? []) {
        if (!COOKBOOK_TERMS.has(term)) {
          out.push({
            slug: entry.slug,
            detail: `cookbook term "${term}" is not in lib/cookbook.ts — /cookbook silently drops the link, so the component looks uncovered`,
          });
        }
      }
    }
    return out;
  },
};

const promptOverlaySlug: Rule = {
  id: "prompt-overlay-slug",
  severity: "error",
  what: "every prompts/<slug>.md names a real registry slug",
  run(ctx) {
    const slugs = new Set(ctx.registry.map((entry) => entry.slug));
    return [...ctx.promptOverlays]
      .filter((name) => !slugs.has(name))
      .map((name) => ({
        detail: `prompts/${name}.md does not match any registry slug — the overlay is silently dropped from that component's AI prompt`,
      }));
  },
};

const dependenciesDeclared: Rule = {
  id: "dependencies-declared",
  severity: "error",
  what: "every declared dependency is a package this repo actually installs",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      for (const dep of entry.dependencies ?? []) {
        if (!ctx.packageDeps.has(dep)) {
          out.push({
            slug: entry.slug,
            detail: `dependency "${dep}" is not in package.json — the copied install command would fail for the customer`,
          });
        }
      }
    }
    return out;
  },
};

/**
 * Packages the prompt tells the customer to already have — its "Stack this
 * source assumes" section states React 19 and the Next App Router outright. The
 * parser reports every specifier; deciding which ones are the buyer's problem is
 * policy, so it lives here rather than in imports.ts.
 */
const FRAMEWORK_PROVIDED = new Set(["react", "react-dom", "next"]);

/**
 * Entries allowed to declare a package their shipped source never imports, with
 * the reason. The NOT_A_LOOP shape — a named exception carrying its own
 * justification — not a PENDING_MIGRATION debt ledger. Empty is the correct
 * state; a legitimate case would be a Tailwind plugin or a side-effect-only
 * package that no `import` statement names.
 */
const DEPENDS_WITHOUT_IMPORT = new Map<string, string>();

const importedPackageDeclared: Rule = {
  id: "imported-package-declared",
  severity: "error",
  what: "every npm package the shipped source imports is declared in dependencies",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const imports = ctx.entryImports(entry.slug);
      if (!imports) continue;
      const declared = new Set(entry.dependencies ?? []);
      for (const pkg of imports.packages) {
        if (FRAMEWORK_PROVIDED.has(pkg) || declared.has(pkg)) continue;
        out.push({
          slug: entry.slug,
          detail: `imports "${pkg}" but dependencies does not list it — the install block would tell the customer to run a command that leaves their paste unbuildable`,
        });
      }
    }
    return out;
  },
};

const importedFileShips: Rule = {
  id: "imported-file-ships",
  severity: "error",
  what: "every non-npm file the shipped source imports is declared as a variant",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const imports = ctx.entryImports(entry.slug);
      if (!imports) continue;
      const shipped = new Set(entry.variants.map((v) => v.file));
      for (const file of imports.files) {
        if (shipped.has(file)) continue;
        const from = imports.via.get(file);
        const path =
          from && !shipped.has(from) ? ` (reached through ${from})` : "";
        out.push({
          slug: entry.slug,
          detail: `imports ${file}${path} but no variant ships it — the Code tab, the install manifest and the AI prompt all omit a file the customer cannot compile without`,
        });
      }
    }
    return out;
  },
};

const importedFileResolves: Rule = {
  id: "imported-file-resolves",
  severity: "error",
  what: "every relative or aliased import inside a shipped file resolves on disk",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const imports = ctx.entryImports(entry.slug);
      if (!imports) continue;
      for (const { raw, from } of imports.unresolved) {
        out.push({
          slug: entry.slug,
          detail: `"${raw}" in ${from} resolves to nothing — the closure walk stops there, so imported-file-ships can only report on the half of this entry it managed to reach`,
        });
      }
    }
    return out;
  },
};

const declaredPackageImported: Rule = {
  id: "declared-package-imported",
  severity: "error",
  what: "every declared dependency is actually imported by the shipped source",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const imports = ctx.entryImports(entry.slug);
      if (!imports || DEPENDS_WITHOUT_IMPORT.has(entry.slug)) continue;
      for (const dep of entry.dependencies ?? []) {
        if (imports.packages.has(dep)) continue;
        out.push({
          slug: entry.slug,
          detail: `declares "${dep}" but no shipped file imports it — only the preview does, and the preview never ships. The customer installs a package they will never load`,
        });
      }
    }
    return out;
  },
};

const previewRegistered: Rule = {
  id: "preview-registered",
  severity: "error",
  what: "every slug has a preview registered in components/registry/previews.ts",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const reads = ctx.previewReads(entry.slug);
      if (!reads.registered) {
        out.push({
          slug: entry.slug,
          detail:
            "no key in previews.ts — LiveWorkspace silently falls back to PlaceholderPreview and the page still returns 200",
        });
      } else if (!reads.found) {
        out.push({
          slug: entry.slug,
          detail: "registered in previews.ts but the imported module is not on disk",
        });
      }
    }
    // A registration with no entry is dead weight and will never be reached.
    const slugs = new Set(ctx.registry.map((e) => e.slug));
    for (const key of ctx.previewKeys) {
      if (!slugs.has(key)) {
        out.push({
          slug: key,
          detail: "registered in previews.ts but no registry entry has this slug",
        });
      }
    }
    return out;
  },
};

const previewReadsEveryProp: Rule = {
  id: "preview-reads-every-prop",
  severity: "error",
  what: "every tuned prop is actually read by its preview (no dead controls)",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const reads = ctx.previewReads(entry.slug);
      // Registration failures are previewRegistered's business, not this rule's.
      if (!reads.found || reads.dynamicAccess) continue;
      for (const prop of entry.props) {
        if (!reads.keys.has(prop.name)) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail:
              "never read by the preview — the control renders and does nothing",
          });
        }
      }
    }
    return out;
  },
};

const previewReadsOnlyDeclaredProps: Rule = {
  id: "preview-reads-only-declared-props",
  severity: "error",
  what: "a preview only reads values.* keys the entry declares",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const reads = ctx.previewReads(entry.slug);
      if (!reads.found) continue;
      const declared = new Set(entry.props.map((p) => p.name));
      for (const key of reads.keys) {
        if (!declared.has(key)) {
          out.push({
            slug: entry.slug,
            prop: key,
            detail:
              "read from values but not declared in the entry — resolves to undefined at runtime",
          });
        }
      }
    }
    return out;
  },
};

const pausableMatchesPreview: Rule = {
  id: "pausable-matches-preview",
  // Heuristic — it reads the preview, not the component, so it stays a warning
  // until an audit shows no false positives.
  severity: "warn",
  what: "a pausable entry's preview actually forwards `paused`",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      if (!entry.pausable) continue;
      const reads = ctx.previewReads(entry.slug);
      if (!reads.found) continue;
      if (!reads.usesPaused) {
        out.push({
          slug: entry.slug,
          detail:
            "pausable: true but the preview never forwards `paused` — the header pause button renders and does nothing",
        });
      }
    }
    return out;
  },
};
// Only this direction is checked. The reverse — a preview forwarding `paused`
// on a non-pausable entry — flagged five entries (barcode, scramble-text,
// magnetic-button, shadow-cursor, file-explorer) that quiesce an entrance
// animation without running a loop. `pausable` gates the header button, which
// exists to halt a free-running loop, so those are correct as they stand.

/**
 * Entries that use rAF or a ResizeObserver for something that is not a
 * free-running render loop. These are permanent exceptions — forcing them onto
 * the runtime host would be worse, not better.
 */
const NOT_A_LOOP = new Map<string, string>([
  ["blueprint-card", "one rAF to flip a drawn flag on mount; no loop"],
  ["circle-menu", "RO measures layout geometry for the arc; no canvas"],
  ["dissolve", "RO measures for a one-shot particle burst"],
  ["marquee-text", "RO measures text width; the marquee itself is CSS"],
  ["marquee-velocity", "RO measures for a scroll-driven transform"],
  [
    "parallax-rail",
    "RO measures rail overflow and pin height; the scrub itself is scroll-driven",
  ],
  [
    "masonry",
    "RO watches item heights and one rAF coalesces repacks; layout only, no render loop",
  ],
  ["border-glow", "bounded easing tweens that terminate themselves"],
  [
    "morphing-text",
    "text morph tween; loops only in auto mode and drives no canvas",
  ],
]);

/**
 * Entries that ARE free-running loops and have simply not been migrated yet.
 * Separate from NOT_A_LOOP on purpose: these warn on every run so the debt
 * stays visible instead of being quietly blessed by an allowlist.
 */
const PENDING_MIGRATION = new Map<string, string>([
  // Empty, and worth keeping that way. The last two residents —
  // physics-engine and variable-proximity — are on the runtime host as of
  // 2026-07-27. Anything added here warns on every single run by design; it is
  // a debt ledger, not a second allowlist. If a new entry genuinely cannot be
  // hosted, it belongs in NOT_A_LOOP with a reason, not here.
]);

const noHandRolledLoop: Rule = {
  id: "no-hand-rolled-loop",
  severity: "error",
  what: "registry components drive animation through the runtime host, not raw rAF/ResizeObserver",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      if (NOT_A_LOOP.has(entry.slug) || PENDING_MIGRATION.has(entry.slug)) continue;
      const usage = ctx.loopUsage(entry.slug);
      if (!usage) continue;
      const parts: string[] = [];
      if (usage.rafCalls > 0) parts.push(`${usage.rafCalls} requestAnimationFrame call(s)`);
      if (usage.resizeObservers > 0) parts.push(`${usage.resizeObservers} ResizeObserver(s)`);
      if (parts.length === 0) continue;
      out.push({
        slug: entry.slug,
        detail: `${parts.join(" and ")} — use hooks/use-animation-loop.ts, or add the slug to NOT_A_LOOP with a reason`,
      });
    }
    return out;
  },
};

// §B.B7. The draw functions are typed `void | false`: a frame that drew returns
// `undefined`, and the host reads a literal `false` as "halt". Coalescing the
// two — `drawRef.current?.(dt) ?? false` — hands the host its halt signal after
// every successful frame, so the component renders once and freezes. It reads
// as a null-guard, which is why it survived review in nineteen files and why a
// person is not a reliable place to keep this rule.
const noNullishHalt: Rule = {
  id: "no-nullish-halt",
  severity: "error",
  what: "an onFrame body never coalesces a void draw into the host's halt signal",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const usage = ctx.loopUsage(entry.slug);
      if (!usage || usage.nullishHalts === 0) continue;
      out.push({
        slug: entry.slug,
        detail: `onFrame coalesces to \`false\` (${usage.nullishHalts}×) — a draw that succeeds returns undefined, so this halts the loop after one frame. Use \`ref.current ? ref.current(x) : false\``,
      });
    }
    return out;
  },
};

const loopHostShipsTheHook: Rule = {
  id: "loop-host-ships-the-hook",
  severity: "error",
  what: "an entry using the runtime host ships it as a peer variant",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const usage = ctx.loopUsage(entry.slug);
      if (!usage?.usesHost) continue;
      if (!entry.variants.some((v) => v.role === "hook")) {
        out.push({
          slug: entry.slug,
          detail:
            "imports the runtime host but declares no hook variant — the customer would copy a component that cannot compile",
        });
      }
    }
    return out;
  },
};

const loopAllowlistCurrent: Rule = {
  id: "loop-allowlist-current",
  severity: "warn",
  what: "the loop allowlists still describe reality",
  run(ctx) {
    const out: Finding[] = [];
    // Only slugs the registry actually contains — an allowlist naming an entry
    // that no longer exists is inert, and reporting it here would fire against
    // every synthetic context in the selftest.
    const present = new Set(ctx.registry.map((e) => e.slug));
    for (const [slug, reason] of PENDING_MIGRATION) {
      if (!present.has(slug)) continue;
      const usage = ctx.loopUsage(slug);
      if (!usage) continue;
      if (usage.rafCalls === 0 && usage.resizeObservers === 0) {
        out.push({ slug, detail: "migrated — remove it from PENDING_MIGRATION" });
      } else {
        out.push({ slug, detail: `not yet on the runtime host (${reason})` });
      }
    }
    for (const [slug] of NOT_A_LOOP) {
      if (!present.has(slug)) continue;
      const usage = ctx.loopUsage(slug);
      if (!usage) continue;
      if (usage.rafCalls === 0 && usage.resizeObservers === 0) {
        out.push({
          slug,
          detail: "no longer uses either primitive — remove it from NOT_A_LOOP",
        });
      }
    }
    return out;
  },
};

/**
 * Props whose documented and shipped defaults legitimately differ because the
 * preview transforms the value on the way down. Keep this set small and visible:
 * every entry is a place the check has been told to look away.
 */
const KNOWN_TRANSFORMS = new Map<string, string>([
  [
    "border-glow.glowColor",
    "registry stores hex for the colour control; BorderGlowPreview applies hexToHsl and the hook's default is an HSL triplet",
  ],
]);

const documentedDefaultMatchesSource: Rule = {
  id: "documented-default-matches-source",
  // Promoted to error once T13-T16 cleared all 88 (T17). Drift here means the
  // props table is describing a component the customer will not receive.
  severity: "error",
  what: "the documented default equals the one the source file actually ships",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      const shipped = ctx.sourceDefaults(entry.slug);
      if (!shipped) continue; // file missing — variantFileExists owns that
      for (const prop of entry.props) {
        if (KNOWN_TRANSFORMS.has(`${entry.slug}.${prop.name}`)) continue;
        const actual = shipped.get(prop.name);
        // No default in the source is not drift: the prop may be required, or
        // destructured without one. Only a resolved literal can disagree.
        if (!actual || actual.kind !== "literal") continue;
        if (!defaultsAgree(prop.default, actual.value)) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: `documented ${JSON.stringify(prop.default)}, source ships ${JSON.stringify(actual.value)} — the customer pastes the second one`,
          });
        }
      }
    }
    return out;
  },
};

/** Walk every variant of every entry, keeping non-null findings. */
function eachVariant(
  ctx: CheckContext,
  probe: (
    entry: CheckContext["registry"][number],
    file: string,
  ) => Finding | null,
): Finding[] {
  const out: Finding[] = [];
  for (const entry of ctx.registry) {
    if (entry.variants.length === 0) {
      out.push({ slug: entry.slug, detail: "entry declares no variants" });
      continue;
    }
    for (const variant of entry.variants) {
      const finding = probe(entry, variant.file);
      if (finding) out.push(finding);
    }
  }
  return out;
}

// ── /collections ────────────────────────────────────────────────────────────
//
// A collection page is a filtered view of the registry, which means it can rot
// in ways an entry cannot: the filter stops matching, two collections drift into
// the same membership, a page falls under the size where it is worth having. All
// four are invisible in review — you would have to resolve every filter by hand
// to see them — and all four are cheap to compute here.

/** Under this, the page is thin content, which is worse than not shipping it. */
const COLLECTION_FLOOR = 5;

/** Under this, the intro is a heading and the page is a bare grid. */
const COLLECTION_INTRO_WORDS = 40;

/** Above this, two pages compete for one query instead of ranking for two. */
const COLLECTION_MAX_JACCARD = 0.8;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const collectionSlug: Rule = {
  id: "collection-slug",
  severity: "error",
  what: "every collection slug is unique and kebab-case",
  run(ctx) {
    const out: Finding[] = [];
    const seen = new Map<string, number>();

    for (const collection of ctx.collections) {
      seen.set(collection.slug, (seen.get(collection.slug) ?? 0) + 1);
      if (!KEBAB.test(collection.slug)) {
        out.push({
          slug: collection.slug,
          detail: "not kebab-case — the slug is the URL at /collections/<slug>",
        });
      }
    }

    for (const [slug, n] of seen) {
      if (n > 1) {
        out.push({
          slug,
          detail: `declared ${n} times — getCollection() resolves the first, the rest are unreachable`,
        });
      }
    }
    return out;
  },
};

const collectionFloor: Rule = {
  id: "collection-floor",
  severity: "error",
  what: `every collection resolves at least ${COLLECTION_FLOOR} components`,
  run(ctx) {
    return ctx.collections
      .map((collection) => ({
        collection,
        n: resolveCollection(collection, ctx.registry).length,
      }))
      .filter((row) => row.n < COLLECTION_FLOOR)
      .map(({ collection, n }) => ({
        slug: collection.slug,
        detail: `resolves ${n} component(s), under the floor of ${COLLECTION_FLOOR} — either the filter is wrong or the page should not exist yet`,
      }));
  },
};

const collectionTermDefined: Rule = {
  id: "collection-terms",
  severity: "error",
  what: "every term a collection filters on is defined in the cookbook",
  run(ctx) {
    const out: Finding[] = [];
    for (const collection of ctx.collections) {
      for (const term of collectionTerms(collection)) {
        if (!COOKBOOK_TERMS.has(term)) {
          out.push({
            slug: collection.slug,
            detail: `filters on "${term}", which lib/cookbook.ts does not define — the filter matches nothing and the page prints no definition`,
          });
        }
      }
    }
    return out;
  },
};

const collectionDepDeclared: Rule = {
  id: "collection-deps",
  severity: "error",
  what: "every package a collection filters on is declared by at least one entry",
  run(ctx) {
    const declared = new Set(
      ctx.registry.flatMap((entry) => entry.dependencies ?? []),
    );
    const out: Finding[] = [];

    for (const collection of ctx.collections) {
      if (collection.filter.kind !== "deps") continue;
      for (const pkg of collection.filter.packages) {
        if (!declared.has(pkg)) {
          out.push({
            slug: collection.slug,
            detail: `filters on "${pkg}", which no entry declares — a renamed or dropped dependency empties the page silently`,
          });
        }
      }
    }
    return out;
  },
};

const collectionIntro: Rule = {
  id: "collection-intro",
  severity: "error",
  what: `every collection carries an intro of at least ${COLLECTION_INTRO_WORDS} words`,
  run(ctx) {
    return ctx.collections
      .map((collection) => ({
        collection,
        words: collection.intro.trim().split(/\s+/).filter(Boolean).length,
      }))
      .filter((row) => row.words < COLLECTION_INTRO_WORDS)
      .map(({ collection, words }) => ({
        slug: collection.slug,
        detail: `intro is ${words} word(s), under ${COLLECTION_INTRO_WORDS} — without it the page is a filtered grid under a heading, which is what a thin-content penalty looks like`,
      }));
  },
};

const collectionOverlap: Rule = {
  id: "collection-overlap",
  severity: "error",
  what: `no two collections share ${COLLECTION_MAX_JACCARD} or more of their members`,
  run(ctx) {
    const sets = ctx.collections.map((collection) => ({
      slug: collection.slug,
      members: new Set(
        resolveCollection(collection, ctx.registry).map((entry) => entry.slug),
      ),
    }));

    const out: Finding[] = [];
    for (const [index, a] of sets.entries()) {
      for (const b of sets.slice(index + 1)) {
        if (a.members.size === 0 || b.members.size === 0) continue;
        const shared = [...a.members].filter((slug) =>
          b.members.has(slug),
        ).length;
        const jaccard = shared / (a.members.size + b.members.size - shared);
        if (jaccard >= COLLECTION_MAX_JACCARD) {
          out.push({
            slug: a.slug,
            detail: `${Math.round(jaccard * 100)}% the same members as "${b.slug}" — near-duplicate pages cannibalise each other instead of ranking for two queries`,
          });
        }
      }
    }
    return out;
  },
};

export const RULES: Rule[] = [
  slugUnique,
  slugMatchesDir,
  variantFileExists,
  variantFileRoot,
  propNamesUnique,
  defaultInDomain,
  disabledWhenTarget,
  addedAtFormat,
  cookbookTermExists,
  promptOverlaySlug,
  dependenciesDeclared,
  importedPackageDeclared,
  importedFileShips,
  importedFileResolves,
  declaredPackageImported,
  previewRegistered,
  previewReadsEveryProp,
  previewReadsOnlyDeclaredProps,
  documentedDefaultMatchesSource,
  pausableMatchesPreview,
  noHandRolledLoop,
  noNullishHalt,
  loopHostShipsTheHook,
  loopAllowlistCurrent,
  collectionSlug,
  collectionFloor,
  collectionTermDefined,
  collectionDepDeclared,
  collectionIntro,
  collectionOverlap,
];
