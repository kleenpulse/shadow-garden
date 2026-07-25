import type { ComponentEntry } from "../../lib/registry/types";

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
