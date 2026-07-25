"use client";

import { useEffect, useState } from "react";
import type { BillingSummary } from "@/lib/registry/billing";

// THE client-side Pro cache. One module-scoped fetch shared by every island that
// gates on Pro — the Go Pro button, the sound toggle, the account dropdown — so a
// page load makes one round-trip instead of one per island.
//
// The account menu used to hold a second, private copy of this: its own useState,
// its own fetch, its own staleness rules. Two caches of the same fact drift, and
// they did — returning from the Polar customer portal reconciled server-side but
// the menu kept rendering the plan it had fetched before the change.

const FREE: BillingSummary = {
  pro: false,
  type: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasSubscription: false,
};

let cached: Promise<BillingSummary> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): Promise<BillingSummary> {
  if (!cached) {
    cached = fetch("/api/billing", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<BillingSummary>) : FREE))
      .catch(() => FREE);
  }
  return cached;
}

/**
 * Drop the cached answer and make every mounted consumer re-fetch. Call this when
 * something has changed the user's entitlement server-side without a page load:
 * a signed-out session, a completed checkout, a return from the customer portal.
 * Consumers keep rendering their previous value while the refetch is in flight,
 * so this never flashes a loading state over settled UI.
 */
export function invalidatePro(): void {
  cached = null;
  version++;
  for (const notify of listeners) notify();
}

/** Full Pro state — plan, status, renewal. `null` while the first fetch resolves. */
export function usePro(): BillingSummary | null {
  const [tick, setTick] = useState(version);
  const [state, setState] = useState<BillingSummary | null>(null);

  useEffect(() => {
    const onInvalidate = () => setTick(version);
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
    };
  }, [tick]);

  return state;
}

/** The gate on its own, for callers that only ask yes/no. `null` = still resolving;
 * gated UI should stay neutral until it settles. A projection of usePro(), not a
 * second cache — the same promise backs both. */
export function useIsPro(): boolean | null {
  const state = usePro();
  return state === null ? null : state.pro;
}
