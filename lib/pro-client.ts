import type { BillingSummary } from "@/lib/registry/billing";

// THE client-side Pro cache. One module-scoped fetch shared by every consumer —
// the Go Pro button, the sound engine, the account dropdown — so a page load
// makes one round-trip instead of one per island.
//
// No React here on purpose. hooks/use-pro.ts is the React binding on top; the
// audio engine is a plain class and subscribes directly. Putting the cache in
// the hooks folder would have forced lib/ to import from hooks/ to reach it.

export const FREE: BillingSummary = {
  pro: false,
  type: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasSubscription: false,
};

let cached: Promise<BillingSummary> | null = null;
let snapshot: BillingSummary | null = null;
const listeners = new Set<(state: BillingSummary) => void>();

export function loadPro(): Promise<BillingSummary> {
  if (!cached) {
    cached = fetch("/api/billing", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<BillingSummary>) : FREE))
      .catch(() => FREE)
      .then((state) => {
        snapshot = state;
        for (const notify of listeners) notify(state);
        return state;
      });
  }
  return cached;
}

/** The last resolved state, or null if the first fetch hasn't landed. */
export function proSnapshot(): BillingSummary | null {
  return snapshot;
}

/**
 * Subscribe to the resolved Pro state. Fires immediately if a state is already
 * known, then again after each invalidation resolves. Returns an unsubscribe.
 * This is the non-React door onto the same cache — never a second one.
 */
export function subscribePro(
  listener: (state: BillingSummary) => void,
): () => void {
  listeners.add(listener);
  if (snapshot) listener(snapshot);
  else void loadPro();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Drop the cached answer and re-resolve. Call this when something has changed
 * the user's entitlement server-side without a page load: a signed-out session,
 * a completed checkout, a return from the customer portal. Subscribers keep
 * their previous value until the refetch lands, so this never flashes a loading
 * state over settled UI.
 */
export function invalidatePro(): void {
  cached = null;
  // `snapshot` is deliberately left in place — see above.
  void loadPro();
}
