import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import {
  createSupabaseServerClient,
  supabaseConfigured,
} from "@/lib/supabase/server";

export interface Entitlement {
  pro: boolean;
}

// The single server-only entitlement seam. Reading cookies()/session makes callers
// dynamic, so gated UI must sit inside a <Suspense> boundary (it already does).
// Resolution order, each a fast exit:
//   1. Env override (local/demo).
//   2. Dev cookie (backward-compat with the original stub).
//   3. Real lookup: Supabase session → entitlements row → derived `pro`.
// Steps 1–2 keep the app fully usable before any credentials exist; step 3 is
// guarded so an unconfigured environment simply resolves { pro: false }.
export async function getEntitlement(): Promise<Entitlement> {
  if (process.env.SHADOW_GARDEN_PRO === "1") return { pro: true };

  const jar = await cookies();
  if (jar.get("sg_pro")?.value === "1") return { pro: true };

  if (!supabaseConfigured() || !process.env.DATABASE_URL) {
    return { pro: false };
  }

  const supabase = await createSupabaseServerClient();
  // getClaims verifies the JWT locally when signing keys are configured, avoiding a
  // round-trip to the auth server in this latency-sensitive dynamic hole.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { pro: false };

  // Lazy import: keep the Node-only postgres-js client out of any edge bundle and
  // out of the module graph entirely until a real lookup is actually needed.
  const { db } = await import("@/lib/db");
  const { entitlements } = await import("@/lib/db/schema");

  const [row] = await db
    .select({
      status: entitlements.status,
      currentPeriodEnd: entitlements.currentPeriodEnd,
    })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);

  if (!row) return { pro: false };

  // pro is DERIVED: active + (lifetime OR not past the current period end).
  const pro =
    row.status === "active" &&
    (row.currentPeriodEnd === null || row.currentPeriodEnd > new Date());

  return { pro };
}
