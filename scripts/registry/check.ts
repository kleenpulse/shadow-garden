import type { ComponentEntry } from "../../lib/registry/types";
import type { SourceDefault } from "./source-defaults";
import type { LoopUsage } from "./loop-usage";

// The registry check core. Pure: every piece of IO arrives on the context, so
// the same rules run against the real repo (scripts/check-registry.ts) or against
// a synthetic registry with no disk at all. Relative imports only, no React, no
// Next, no DOM — this has to run under plain `bun` (§C5).

export type Severity = "error" | "warn";

/** What a rule reports. The rule id and severity are stamped on by checkRegistry. */
export interface Finding {
  slug?: string;
  prop?: string;
  detail: string;
}

export interface Violation extends Finding {
  rule: string;
  severity: Severity;
}

/** What a preview module reads off its `values` prop. */
export interface PreviewReads {
  /** Absent when the slug has no registration in previews.ts. */
  registered: boolean;
  /** Absent when the registered module could not be read from disk. */
  found: boolean;
  keys: Set<string>;
  /** True if the preview uses `values[expr]`, which defeats static extraction. */
  dynamicAccess: boolean;
  /** True if the preview references the `paused` PreviewProps field at all. */
  usesPaused: boolean;
}

/**
 * The transitive import closure of an entry's declared variants — precisely the
 * bytes getSource() hands the customer, and everything those bytes reach.
 * Previews are not variants, so they are outside the closure by construction:
 * that is what makes a package only the preview imports show up as over-declared
 * rather than silently justified (§V40).
 */
export interface EntryImports {
  /** npm packages reachable from the entry's variants, normalised to install names. */
  packages: Set<string>;
  /** Repo-relative files reachable via `@/` or `./`, excluding the variants themselves. */
  files: Set<string>;
  /** For each reached file, the file it was imported from — makes a transitive finding actionable. */
  via: Map<string, string>;
  /**
   * Specifiers that resolved to nothing on disk. Never silent: a broken edge
   * truncates the walk, so an incomplete closure would otherwise look complete.
   */
  unresolved: Array<{ raw: string; from: string }>;
}

export interface CheckContext {
  registry: ComponentEntry[];
  /** Directory names present directly under components/registry/. */
  dirs: Set<string>;
  /** Existence probe for a repo-root-relative, forward-slashed path. */
  fileExists(relative: string): boolean;
  /** Every package name declared in package.json (deps + devDeps). */
  packageDeps: Set<string>;
  /** Slugs registered in components/registry/previews.ts. */
  previewKeys: Set<string>;
  /** Static read of a slug's preview module. */
  previewReads(slug: string): PreviewReads;
  /**
   * Destructuring defaults shipped by the entry's canonical source file, or
   * `null` when it could not be read. Keys absent from the map have no default
   * in the source at all.
   */
  sourceDefaults(slug: string): Map<string, SourceDefault> | null;
  /** Hand-rolled runtime primitives in a slug's component source. */
  loopUsage(slug: string): LoopUsage | null;
  /**
   * Everything a slug's shipped source imports, walked transitively. `null` when
   * the entry declares no variant that exists on disk — `variant-file-exists`
   * owns that failure, so this stays quiet about it.
   */
  entryImports(slug: string): EntryImports | null;
  /** Basenames (no extension) of the AI-prompt overlays in prompts/. */
  promptOverlays: Set<string>;
}

export interface Rule {
  id: string;
  severity: Severity;
  /** One-line statement of what this rule enforces, printed with failures. */
  what: string;
  run(ctx: CheckContext): Finding[];
}

export function checkRegistry(ctx: CheckContext, rules: Rule[]): Violation[] {
  return rules.flatMap((rule) =>
    rule.run(ctx).map((finding) => ({
      rule: rule.id,
      severity: rule.severity,
      ...finding,
    })),
  );
}

export function hasErrors(violations: Violation[]): boolean {
  return violations.some((v) => v.severity === "error");
}
