import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import {
  createSupabaseServerClient,
  supabaseConfigured,
} from "@/lib/supabase/server";

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
  // (no plan details — it's a dev toggle, not a real purchase).
  if (process.env.SHADOW_GARDEN_PRO === "1") return { ...FREE, pro: true };
  const jar = await cookies();
  if (jar.get("sg_pro")?.value === "1") return { ...FREE, pro: true };

  if (!supabaseConfigured() || !process.env.DATABASE_URL) return FREE;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return FREE;

  const { db } = await import("@/lib/db");
  const { entitlements } = await import("@/lib/db/schema");
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

  const pro =
    row.status === "active" &&
    (row.currentPeriodEnd === null || row.currentPeriodEnd > new Date());

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
