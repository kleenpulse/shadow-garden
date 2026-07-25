import "server-only";
import { getPro } from "@/lib/pro";

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
