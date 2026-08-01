import type { VariantRole } from "./types";

// Everything that varies by variant role, in one table — the §V16 shape, applied
// to files instead of prop kinds. Every consumer (the Code tab strip, the AI
// prompt, the registry check) reads through this table rather than switching on
// the role itself, so a fifth role is a compile error at the single `satisfies`
// below instead of a silent gap in three renderers.
//
// Deliberately free of React, Next and `server-only`: the client CodeTabs and the
// headless scripts/registry/ both import it (§C5).

export interface RoleMeta {
  /** Short tag next to the filename in the Code tab strip. `null` = no tag. */
  badge: string | null;
  /** Appended to the file's heading in the AI prompt's "Files to create". */
  promptSuffix: string;
  /**
   * One integration rule emitted when an entry ships a file of this role. `null`
   * for the component itself, which needs no explanation of why it is required.
   */
  contract: string | null;
}

export const ROLE_TABLE = {
  component: {
    badge: null,
    promptSuffix: "",
    contract: null,
  },
  hook: {
    badge: "peer",
    promptSuffix: " — peer hook, required",
    contract:
      "The peer hook is required, not optional. Copy it to `hooks/use-animation-loop.ts` so the component's `@/hooks/use-animation-loop` import resolves.",
  },
  util: {
    badge: "util",
    promptSuffix: " — peer util, required",
    contract:
      "`lib/utils.ts` is required, not optional. It exports the `cn` helper the component imports from `@/lib/utils` — keep it at that path, or rewrite every `cn` import to wherever you already keep yours. If your project is shadcn-based you almost certainly have this file already; keep yours and drop mine.",
  },
  peer: {
    badge: "peer",
    promptSuffix: " — supporting file, required",
    contract:
      "The supporting files are part of the component, not examples. Copy every file listed, preserving the directory layout — they import each other by relative path.",
  },
} as const satisfies Record<VariantRole, RoleMeta>;

/** Variant.role is optional in the data; everything downstream wants it total. */
export function roleOf(role: VariantRole | undefined): VariantRole {
  return role ?? "component";
}

/**
 * Roles present in a file set, in ROLE_TABLE declaration order. Order comes from
 * the table rather than the file list so the prompt's integration rules are
 * byte-stable across entries that happen to declare their variants differently.
 */
export function rolesPresent(roles: Iterable<VariantRole>): VariantRole[] {
  const present = new Set(roles);
  return (Object.keys(ROLE_TABLE) as VariantRole[]).filter((role) =>
    present.has(role),
  );
}
