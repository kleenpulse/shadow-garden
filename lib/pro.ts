import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/lib/supabase/current-user";
import { has } from "@/lib/capabilities";
import { IS_LOCAL_DEV } from "@/lib/env";

// THE server-side Pro seam. One resolution ladder, one place. Everything that
// asks "is this user Pro?" on the server answers from getPro() — the cheap
// {pro} gate and the rich account-menu summary are both projections of the same
// call, so they cannot disagree about a user's status.
//
// They used to be two functions with the ladder copied line for line, including
// both dev-override branches. That is exactly the shape where a fix lands in one
// copy and not the other.

/** Which rung of the ladder answered. `"none"` = not Pro. */
export type ProSource = "env" | "cookie" | "db" | "none";

export interface ProState {
  pro: boolean;
  source: ProSource;
  type: "subscription" | "lifetime" | null;
  status: string | null;
  currentPeriodEnd: string | null; // ISO; null == lifetime / none
  cancelAtPeriodEnd: boolean;
  /** Has a live subscription to manage or upgrade. */
  hasSubscription: boolean;
}

const NOT_PRO: ProState = {
  pro: false,
  source: "none",
  type: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasSubscription: false,
};

// A dev override grants Pro with no plan details — it is a toggle, not a purchase.
function override(source: "env" | "cookie"): ProState {
  return { ...NOT_PRO, pro: true, source };
}

// pro is DERIVED: active + (lifetime OR not past the current period end). Module-private
// — the ladder is the only thing that should be answering this question.
function deriveProStatus(row: {
  status: string | null;
  currentPeriodEnd: Date | null;
}): boolean {
  return (
    row.status === "active" &&
    (row.currentPeriodEnd === null || row.currentPeriodEnd > new Date())
  );
}

// Reading cookies()/session makes callers dynamic, so gated UI must sit inside a
// <Suspense> boundary (it already does).
//
// Resolution order, each a fast exit:
//   1. Env override (local/demo) — dev only.
//   2. Dev cookie (backward-compat with the original stub) — dev only.
//   3. Real lookup: Supabase session → entitlements row → derived `pro`.
// Steps 1–2 keep the app fully usable before any credentials exist; step 3 is
// guarded so an unconfigured environment simply resolves to NOT_PRO.
//
// Both overrides are gated on IS_LOCAL_DEV. `sg_pro` is a plain cookie any
// visitor can set, so honouring it in production hands out every Pro source
// file via getSource(). The env var is server-set and not attacker-reachable,
// but .env.example has always documented it as "env unlock for local runs" —
// so it follows the same rule rather than becoming the one live prod bypass.
// The cookie is still read unconditionally: skipping it in production would
// change when this function goes dynamic, and PPR depends on that shape.
export async function getPro(): Promise<ProState> {
  if (IS_LOCAL_DEV && process.env.SHADOW_GARDEN_PRO === "1")
    return override("env");

  const jar = await cookies();
  if (IS_LOCAL_DEV && jar.get("sg_pro")?.value === "1")
    return override("cookie");

  if (!has("db")) return NOT_PRO;

  const userId = await currentUserId();
  if (!userId) return NOT_PRO;

  // Lazy import: keep the Node-only postgres-js client out of any edge bundle and
  // out of the module graph entirely until a real lookup is actually needed.
  const { getDb } = await import("@/lib/db");
  const { entitlements } = await import("@/lib/db/schema");

  const db = getDb();
  if (!db) return NOT_PRO;

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

  if (!row) return NOT_PRO;

  const pro = deriveProStatus(row);

  return {
    pro,
    // A row that exists but has lapsed is still the db's answer — `source`
    // records who decided, not whether the answer was yes.
    source: "db",
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
