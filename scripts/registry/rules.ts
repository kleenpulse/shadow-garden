import type { CheckContext, Finding, Rule } from "./check";

// The cheap rules — pure data plus one readdir and one package.json read. Each
// one closes an invariant that used to fail silently at runtime: a wrong entry
// still built, still rendered, and only showed up if someone dragged the right
// slider (§V.V6, V7, V9).
//
// The expensive rules (preview read-keys, documented-vs-shipped defaults) need a
// TypeScript pass and arrive in T11/T12.

/** Paths a variant may point at. T19 adds "hooks/" when the loop host ships. */
const VARIANT_ROOTS = ["components/registry/"];

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

const numberDefaultInRange: Rule = {
  id: "number-default-in-range",
  severity: "error",
  what: "a number prop's default lies within [min, max]",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      for (const prop of entry.props) {
        if (prop.kind !== "number") continue;
        if (prop.min > prop.max) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: `min ${prop.min} exceeds max ${prop.max}`,
          });
          continue;
        }
        if (prop.default < prop.min || prop.default > prop.max) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: `default ${prop.default} outside [${prop.min}, ${prop.max}] — the slider clamps and disagrees with the props table`,
          });
        }
      }
    }
    return out;
  },
};

const enumDefaultInOptions: Rule = {
  id: "enum-default-in-options",
  severity: "error",
  what: "an enum prop's default is one of its options",
  run(ctx) {
    const out: Finding[] = [];
    for (const entry of ctx.registry) {
      for (const prop of entry.props) {
        if (prop.kind !== "enum") continue;
        if (prop.options.length === 0) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: "enum prop has no options",
          });
          continue;
        }
        if (!prop.options.includes(prop.default)) {
          out.push({
            slug: entry.slug,
            prop: prop.name,
            detail: `default "${prop.default}" not in options [${prop.options.join(", ")}] — nuqs will never round-trip it`,
          });
        }
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
  numberDefaultInRange,
  enumDefaultInOptions,
  disabledWhenTarget,
  addedAtFormat,
  dependenciesDeclared,
  previewRegistered,
  previewReadsEveryProp,
  previewReadsOnlyDeclaredProps,
];
