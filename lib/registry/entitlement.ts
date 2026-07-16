import "server-only";
import { cookies } from "next/headers";

export interface Entitlement {
  pro: boolean;
}

// v1 stub with the REAL shape: a single server-only entitlement seam living
// exactly where real auth/subscription will go. Reading cookies() makes callers
// dynamic, so gated UI must sit inside a <Suspense> boundary. Swap the body for a
// real subscription lookup later — every call site stays unchanged.
export async function getEntitlement(): Promise<Entitlement> {
  // 1. Env override for local/demo runs.
  if (process.env.SHADOW_GARDEN_PRO === "1") return { pro: true };

  // 2. A dev cookie standing in for a future signed session.
  const jar = await cookies();
  if (jar.get("sg_pro")?.value === "1") return { pro: true };

  return { pro: false };
}
