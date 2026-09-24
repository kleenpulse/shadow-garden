// One question, one shape: "does this deployment have the credentials for X?"
//
// Deliberately NOT "server-only". The Supabase predicate is read in three
// runtimes — the Node server, the edge proxy, and the browser — and each had
// grown its own copy of the URL-plus-key-with-legacy-fallback expression. Three
// copies of a rule that must agree is three chances for a key rename to be
// applied twice.
//
// The predicates are functions, not module constants: env can be injected at
// runtime, and capturing at import time bakes in whatever was set when the
// module first loaded.
//
// `process.env.X` must stay a literal member access. Next inlines NEXT_PUBLIC_*
// into client bundles by static text substitution, so `process.env[key]` would
// silently resolve to undefined in the browser. That is why this is a table of
// closures rather than a table of variable names.

export type Capability = "db" | "supabase" | "polar" | "polarWebhook" | "email";

/**
 * Launch switch. While true, every real build (preview + prod) reports commerce
 * as unarmed no matter what env is set: nothing sells, so nothing locks, and the
 * shell shows a "coming soon" marker instead of Go Pro. Local dev is exempt so
 * the full commerce stack stays exercisable against dev env. Read at build time
 * (module-scope consumers), so flipping it means a deploy — same contract as
 * GATE_CONTROLS. False since 2026-09-24: payments are live (Polar org verified);
 * set back to true to pause selling without disturbing env.
 */
export const COMMERCE_COMING_SOON = false;

/** The Supabase URL, or undefined. Public — inlines into the browser bundle. */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Prefer the new publishable key (`sb_publishable_…`); accept the legacy anon
 * (JWT) key as a fallback. The one place this precedence is written down. */
export function supabaseKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const PREDICATES: Record<Capability, () => boolean> = {
  db: () => Boolean(process.env.DATABASE_URL),
  supabase: () => Boolean(supabaseUrl() && supabaseKey()),
  polar: () => Boolean(process.env.POLAR_ACCESS_TOKEN),
  polarWebhook: () => Boolean(process.env.POLAR_WEBHOOK_SECRET),
  email: () =>
    Boolean(process.env.NODEMAILER_EMAIL && process.env.NODEMAILER_PW),
};

/**
 * Is this capability configured? Sync, never throws, never async — so it is safe
 * in a module-scope const, a route guard, or a render.
 *
 * Only `"supabase"` is meaningful in a browser bundle; the rest read server-side
 * env vars, which are absent by design on the client and so answer `false`
 * there. Call those on the server or the edge.
 */
export function has(capability: Capability): boolean {
  return PREDICATES[capability]();
}

/**
 * Checkout → auth → entitlement row: all three legs configured. The commerce UI
 * (Go Pro, auth menu, pricing modal) mounts and the Pro gate locks only when
 * this answers true — an unarmed deployment sells nothing, so it locks nothing.
 * Server-only meaningful: `polar`/`db` read server env and answer false in a
 * browser bundle.
 */
export function commerceArmed(): boolean {
  // NODE_ENV is statically inlined in every runtime this file reaches (see
  // lib/env.ts); inlined here rather than imported to keep this module
  // dependency-free for the edge proxy.
  if (COMMERCE_COMING_SOON && process.env.NODE_ENV === "production")
    return false;
  return has("polar") && has("supabase") && has("db");
}
