import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/lib/supabase/current-user";
import { deriveProStatus } from "@/lib/registry/entitlement";
import { IS_LOCAL_DEV } from "@/lib/env";

// Richer billing summary for the account dropdown. Separate from getEntitlement()
// (which stays the cheap {pro} gate) — this exposes plan + next-payment details.

export interface BillingSummary {
  pro: boolean;
  type: "subscription" | "lifetime" | null;
  status: string | null;
  currentPeriodEnd: string | null; // ISO; null == lifetime / none
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean; // has a live subscription to manage/upgrade
}

const FREE: BillingSummary = {
  pro: false,
  type: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasSubscription: false,
};

export async function getBilling(): Promise<BillingSummary> {
  // Mirror getEntitlement's dev overrides so SHADOW_GARDEN_PRO still previews Pro
  // (no plan details — it's a dev toggle, not a real purchase). Gated on
  // IS_LOCAL_DEV for the same reason as getEntitlement — see the note there.
  if (IS_LOCAL_DEV && process.env.SHADOW_GARDEN_PRO === "1")
    return { ...FREE, pro: true };
  const jar = await cookies();
  if (IS_LOCAL_DEV && jar.get("sg_pro")?.value === "1")
    return { ...FREE, pro: true };

  if (!process.env.DATABASE_URL) return FREE;

  const userId = await currentUserId();
  if (!userId) return FREE;

  const { getDb } = await import("@/lib/db");
  const { entitlements } = await import("@/lib/db/schema");
  const db = getDb();
  if (!db) return FREE;
  const [row] = await db
    .select({
      type: entitlements.type,
      status: entitlements.status,
      currentPeriodEnd: entitlements.currentPeriodEnd,
      cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
      polarSubscriptionId: entitlements.polarSubscriptionId,
    })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);

  if (!row) return FREE;

  const pro = deriveProStatus(row);

  return {
    pro,
    type: row.type,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd
      ? row.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    hasSubscription:
      row.type === "subscription" && Boolean(row.polarSubscriptionId),
  };
}
