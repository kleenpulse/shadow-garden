// The favourites rules, as pure functions. No fetch, no store, no db, no React —
// this module decides what a favourites list should contain and in what order,
// and nothing else.
//
// Those rules used to live in three places that each knew a piece: the Zustand
// store owned insertion order, FavoritesSync owned the merge-and-diff, and the
// API route owned the registry whitelist. So the client would happily hold a
// slug the server refused, and only the server could tell you the list was
// invalid. Everything below runs on both sides now.
//
// The canonical shape of a favourites list: **newest first, no duplicates**.
// `order` is that shape; every other function returns something already in it.

/** Dedupe, first occurrence wins. In a newest-first list, that keeps the newest. */
export function order(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    if (typeof slug !== "string" || slug.length === 0) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * Coerce arbitrary input into a valid list. `input` is genuinely `unknown` at
 * both call sites — a POST body on the server, a rehydrated localStorage blob on
 * the client — so this takes the widest type rather than making callers pre-check.
 * Pass `allowed` (the registry slugs) to drop entries that no longer exist; omit
 * it only where the caller has no registry to check against.
 */
export function sanitize(
  input: unknown,
  allowed?: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(input)) return [];
  const strings = input.filter((s): s is string => typeof s === "string");
  const known = allowed ? strings.filter((s) => allowed.has(s)) : strings;
  return order(known);
}

/** Favourite `slug`, newest first. Already-present is a no-op — re-favouriting
 * something must not jump it to the top of the list. */
export function add(slugs: readonly string[], slug: string): string[] {
  return slugs.includes(slug) ? [...slugs] : [slug, ...slugs];
}

export function remove(slugs: readonly string[], slug: string): string[] {
  return slugs.filter((s) => s !== slug);
}

export function toggle(slugs: readonly string[], slug: string): string[] {
  return slugs.includes(slug) ? remove(slugs, slug) : add(slugs, slug);
}

/**
 * Sign-in: everything favourited offline is pushed up to the account. Local wins
 * the ordering because those are the more recent actions — the ones taken since
 * this browser last talked to the server.
 */
export function mergeUp(
  local: readonly string[],
  server: readonly string[],
): string[] {
  return order([...local, ...server]);
}

/**
 * Take the server's set as authoritative, discarding local ordering. Runs after
 * mergeUp has been written up, so nothing offline is lost — and this is what
 * propagates a removal made on another device.
 */
export function adopt(server: readonly string[], allowed?: ReadonlySet<string>): string[] {
  return sanitize([...server], allowed);
}

export interface Delta {
  added: string[];
  removed: string[];
}

/** What changed between a synced snapshot and the current list. */
export function diff(prev: readonly string[], next: readonly string[]): Delta {
  const before = new Set(prev);
  const after = new Set(next);
  return {
    added: next.filter((s) => !before.has(s)),
    removed: prev.filter((s) => !after.has(s)),
  };
}

/** Nothing to send. Saves the sync path a pointless pair of empty loops. */
export function isEmpty(delta: Delta): boolean {
  return delta.added.length === 0 && delta.removed.length === 0;
}
