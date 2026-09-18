import "server-only";
import { commerceArmed } from "@/lib/capabilities";
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
  // ALWAYS awaited — the ladder's cookies() read happens unconditionally so the
  // PPR shape never forks on env presence; `armed` changes the answer, not the
  // access. An unarmed deployment sells nothing, so it locks nothing.
  const { pro } = await getPro();
  return { pro: pro || !commerceArmed() };
}

// The Controls panel is a SOFTER gate than source, install and the props table:
// live tuning is the demo, so whether it sells or demos is a deployment
// decision. GATE_CONTROLS unset → controls stay open to everyone regardless of
// tier. Source, install and props are untouched by this flag — those gate the
// paid artifact (props joined them 2026-09-18 at the user's call) and ride the
// armed pro gate unconditionally.
//
// Server-only read (no NEXT_PUBLIC prefix), so it is never inlined into a client
// bundle; every caller is a server component below a <Suspense> boundary.
export const GATE_CONTROLS =
  process.env.GATE_CONTROLS === "1" || process.env.GATE_CONTROLS === "true";

/**
 * Should the Controls panel render locked for this visitor? Short-circuits
 * before getEntitlement() when the gate is off, so an ungated deploy never
 * pays for the cookie read — the returned promise is already resolved and the
 * caller stays static.
 *
 * Deliberately consumed as a PROMISE via `use()` inside LiveWorkspace /
 * FullscreenStage rather than awaited in a server wrapper: an async server
 * component PARENTING the client workspace (which reads searchParams via nuqs)
 * corrupts the Flight decode on client-side navigation under Cache Components
 * ("chunk.reason.enqueueModel is not a function", Next 16.3.5) — the dynamic
 * access has to originate at the use() site under the page's own <Suspense>,
 * with no async layer above the client component.
 */
export async function isControlsLocked(
  pro: ComponentEntry["pro"],
): Promise<boolean> {
  if (!GATE_CONTROLS || !pro) return false;
  const { pro: entitled } = await getEntitlement();
  return !entitled;
}
