import type { CheckContext, Finding, Rule } from "./check";
import { defaultsAgree } from "./source-defaults";
import { validateDefault } from "../../lib/registry/kinds";
import { PHILOSOPHY_TERMS } from "../../lib/philosophy";

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
      VARIANT_ROOTS.some((root) => file.startsWith(root))
        ? null
        : {
            slug: entry.slug,
            detail: `variant file outside ${VARIANT_ROOTS.join(" | ")}: ${file}`,
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

const philosophyTermExists: Rule = {
  id: "philosophy-term-exists",
  severity: "error",
  what: "every cited philosophy term is defined in lib/philosophy.ts",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      for (const term of entry.philosophy ?? []) {
        if (!PHILOSOPHY_TERMS.has(term)) {
          out.push({
            slug: entry.slug,
            detail: `philosophy term "${term}" is not in lib/philosophy.ts — /philosophy silently drops the link, so the component looks uncovered`,
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
  ["scroll-velocity", "RO measures for a scroll-driven transform"],
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
  ["physics-engine", "pausable canvas sim with its own rAF loop and RO"],
  ["variable-proximity", "pausable, free-running rAF pointer follow"],
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

export const RULES: Rule[] = [
  slugUnique,
  slugMatchesDir,
  variantFileExists,
  variantFileRoot,
  propNamesUnique,
  defaultInDomain,
  disabledWhenTarget,
  addedAtFormat,
  philosophyTermExists,
  promptOverlaySlug,
  dependenciesDeclared,
  previewRegistered,
  previewReadsEveryProp,
  previewReadsOnlyDeclaredProps,
  documentedDefaultMatchesSource,
  pausableMatchesPreview,
  noHandRolledLoop,
  noNullishHalt,
  loopHostShipsTheHook,
  loopAllowlistCurrent,
];
