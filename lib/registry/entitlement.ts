import "server-only";
import { getPro } from "@/lib/pro";
import type { ComponentEntry } from "./types";

// A projection of the Pro seam, not a second resolution ladder. This is the cheap
// {pro} gate — source-file entitlement and the install block.
// The ladder itself lives in lib/pro.ts; this narrows its answer to one boolean so
// callers that only need the gate can't accidentally depend on plan details.

export interface Entitlement {
  pro: boolean;
}

export async function getEntitlement(): Promise<Entitlement> {
  const { pro } = await getPro();
  return { pro };
}

// The Controls panel and the Props API table are a SOFTER gate than source and
// install: they are presentation, not the paid artifact, so whether they sell or
// demo is a deployment decision. GATE_CONTROLS unset → both stay open to everyone
// regardless of tier. Source and install are untouched by this flag — those gate
// the thing being bought and stay unconditional.
//
// Server-only read (no NEXT_PUBLIC prefix), so it is never inlined into a client
// bundle; every caller is a server component below a <Suspense> boundary.
export const GATE_CONTROLS =
  process.env.GATE_CONTROLS === "1" || process.env.GATE_CONTROLS === "true";

/**
 * Should the Controls panel / Props table render locked for this visitor?
 * Short-circuits before getEntitlement() when the gate is off, so an ungated
 * deploy never pays for the cookie read.
 */
export async function isControlsLocked(
  tier: ComponentEntry["tier"],
): Promise<boolean> {
  if (!GATE_CONTROLS || tier !== "pro") return false;
  const { pro } = await getEntitlement();
  return !pro;
}
