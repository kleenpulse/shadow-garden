"use client";

import { useEffect, useState } from "react";
import type { BillingSummary } from "@/lib/registry/billing";
import { proSnapshot, subscribePro } from "@/lib/pro-client";

// React bindings over THE client Pro cache (lib/pro-client.ts). They hold no
// state of their own — the account menu used to keep a private copy and it
// drifted from what the rest of the app believed.

export { invalidatePro } from "@/lib/pro-client";

/** Full Pro state — plan, status, renewal. `null` while the first fetch resolves. */
export function usePro(): BillingSummary | null {
  // Seed from the snapshot so an island mounting after the fetch has landed
  // renders the answer immediately instead of flashing through null.
  const [state, setState] = useState<BillingSummary | null>(proSnapshot);
  // subscribePro kicks off the first load and fires again on every
  // invalidation, so there is nothing else to react to.
  useEffect(() => subscribePro(setState), []);
  return state;
}

/** The gate on its own, for callers that only ask yes/no. `null` = still resolving;
 * gated UI should stay neutral until it settles. A projection of usePro(), not a
 * second cache — the same subscription backs both. */
export function useIsPro(): boolean | null {
  const state = usePro();
  return state === null ? null : state.pro;
}
