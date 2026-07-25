import type { PropSchema } from "./types";

// The prop-kind table. Everything that varies BY kind and does not need React or
// nuqs lives here, keyed by the kind itself — so adding a fifth kind to
// PropSchema is a compile error at this one table rather than four silent
// omissions scattered across the bench.
//
// Deliberately free of React, nuqs and Next imports. scripts/registry runs
// headless under plain `bun` (SPEC §C5) and needs validateDefault, so this
// module has to stay importable there. The two tables that genuinely need a
// framework — the control components and the query parsers — stay at their own
// boundaries and are keyed by PropKind for the same totality guarantee.

export type PropKind = PropSchema["kind"];

/** The schema variant for one kind. `PropOfKind<"number">` is NumberProp. */
export type PropOfKind<K extends PropKind> = Extract<PropSchema, { kind: K }>;

export interface KindSpec<P extends PropSchema> {
  /** The TypeScript type as the props table should print it. */
  typeLabel(prop: P): string;
  /** The default as the props table should print it — quoted where the value is
   *  a string, so a reader can tell `"none"` from `none`. */
  formatDefault(prop: P): string;
  /**
   * Why this prop's documented default is outside its own domain, or null when
   * it is fine. The registry check surfaces the string; the bench never sees it.
   */
  validateDefault(prop: P): string | null;
}

export const KIND_TABLE: { [K in PropKind]: KindSpec<PropOfKind<K>> } = {
  number: {
    typeLabel: () => "number",
    formatDefault: (prop) => String(prop.default),
    validateDefault: (prop) => {
      if (prop.min > prop.max) return `min ${prop.min} exceeds max ${prop.max}`;
      if (prop.default < prop.min || prop.default > prop.max) {
        return `default ${prop.default} outside [${prop.min}, ${prop.max}] — the slider clamps and disagrees with the props table`;
      }
      return null;
    },
  },
  enum: {
    typeLabel: (prop) => prop.options.map((o) => `"${o}"`).join(" | "),
    formatDefault: (prop) => `"${prop.default}"`,
    validateDefault: (prop) => {
      if (prop.options.length === 0) return "enum prop has no options";
      if (!prop.options.includes(prop.default)) {
        return `default "${prop.default}" not in options [${prop.options.join(", ")}] — nuqs will never round-trip it`;
      }
      return null;
    },
  },
  boolean: {
    typeLabel: () => "boolean",
    formatDefault: (prop) => String(prop.default),
    validateDefault: () => null,
  },
  color: {
    typeLabel: () => "string (hex)",
    formatDefault: (prop) => `"${prop.default}"`,
    validateDefault: (prop) =>
      /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(prop.default)
        ? null
        : `default "${prop.default}" is not a hex colour — the picker cannot render it`,
  },
};

// `prop as never` is the standard escape for calling a method off a union-typed
// table lookup: TypeScript cannot correlate KIND_TABLE[prop.kind] with the
// narrowing of `prop`, so it demands the intersection of every parameter type.
// The lookup IS correct — same discriminant on both sides. One cast per
// accessor, here, instead of a switch at every call site.

export function typeLabel(prop: PropSchema): string {
  return KIND_TABLE[prop.kind].typeLabel(prop as never);
}

export function formatDefault(prop: PropSchema): string {
  return KIND_TABLE[prop.kind].formatDefault(prop as never);
}

export function validateDefault(prop: PropSchema): string | null {
  return KIND_TABLE[prop.kind].validateDefault(prop as never);
}
