import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/lib/supabase/current-user";

export interface Entitlement {
  pro: boolean;
}

// pro is DERIVED: active + (lifetime OR not past the current period end). The single
// place the rule lives — getBilling() reuses it so the two never drift.
export function deriveProStatus(row: {
  status: string | null;
  currentPeriodEnd: Date | null;
}): boolean {
  return (
    row.status === "active" &&
    (row.currentPeriodEnd === null || row.currentPeriodEnd > new Date())
  );
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

  if (!process.env.DATABASE_URL) return { pro: false };

  const userId = await currentUserId();
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

  return { pro: deriveProStatus(row) };
}
