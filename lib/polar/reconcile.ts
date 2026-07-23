import "server-only";
import { getPolar } from "@/lib/polar";
import { notifyUser } from "@/lib/email/notify";
import { subscribeConfirmationEmail } from "@/lib/email/templates";

// Polar → DB reconciliation, shared by two paths:
//   1. the webhook (PUSH — async, best-effort; can be missed on tunnel/deploy/outage)
//   2. checkout-return sync (PULL — reads Polar's API on redirect; the guarantee)
// The `entitlements` row (not Polar) is our source of truth for `pro`; both paths
// converge to the same row. Node-runtime only (Drizzle) — never import from the edge.

// Structural subsets of Polar's Order/Subscription — only the fields we consume.
// The SDK's fully-typed payloads (webhook + list responses) are structurally
// assignable to these, so we avoid importing brittle SDK model subpaths.
export interface PolarCustomerLike {
  externalId?: string | null;
}
export interface PolarSubscriptionLike {
  id: string;
  status: string;
  productId: string;
  customerId: string;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  customer?: PolarCustomerLike | null;
}
export interface PolarOrderLike {
  id: string;
  productId: string | null;
  customerId: string;
  customer?: PolarCustomerLike | null;
}

const lifetimeProductId = process.env.POLAR_PRODUCT_ID_LIFETIME;

export type EntStatus =
  | "active"
  | "canceled"
  | "revoked"
  | "past_due"
  | "expired"
  | "incomplete";

// Map Polar's subscription status onto our enum. `pro` is derived downstream as
// status='active' AND period not elapsed, so a scheduled cancel (still 'active' with
// cancelAtPeriodEnd) correctly keeps Pro until the period end.
export function mapSubStatus(status: string): EntStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
    case "incomplete_expired":
      return "expired";
    case "incomplete":
      return "incomplete";
    default:
      return "incomplete";
  }
}

// Cancelling a membership only stops the NEXT renewal — the member keeps Pro through
// the period they already paid for. So while a cancel is scheduled and the period is
// still in the future, hold the row at "active" (derived `pro` then expires on its own
// at current_period_end, even if the later revoke webhook is missed). Whether Polar
// labels a pending cancel "active" or "canceled", this normalises to the same result.
// Only a true immediate cancel/revoke (no cancelAtPeriodEnd) drops access now.
function effectiveStatus(data: PolarSubscriptionLike): EntStatus {
  const base = mapSubStatus(data.status);
  if (
    base === "canceled" &&
    data.cancelAtPeriodEnd &&
    (data.currentPeriodEnd == null || data.currentPeriodEnd > new Date())
  ) {
    return "active";
  }
  return base;
}

async function upsertEntitlement(input: {
  userId: string;
  type: "subscription" | "lifetime";
  status: EntStatus;
  polarCustomerId?: string | null;
  polarSubscriptionId?: string | null;
  polarOrderId?: string | null;
  polarProductId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  // Lazy import keeps the Node-only DB client out of the module graph until a real
  // reconcile fires. The DATABASE_URL connection owns the tables → bypasses RLS.
  const { db } = await import("@/lib/db");
  const { entitlements } = await import("@/lib/db/schema");

  // Snapshot Pro state BEFORE the write — drives the one-time confirmation email.
  // This is the convergence point for every grant path (webhook sub, webhook
  // lifetime order, and the checkout-return sync), so a single check here covers
  // them all with no double-send.
  const priorStatus = (await getExistingEntitlement(input.userId))?.status ?? null;

  const values = {
    userId: input.userId,
    type: input.type,
    status: input.status,
    polarCustomerId: input.polarCustomerId ?? null,
    polarSubscriptionId: input.polarSubscriptionId ?? null,
    polarOrderId: input.polarOrderId ?? null,
    polarProductId: input.polarProductId ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
  };

  // Idempotent: unique(user_id) → repeated deliveries converge to the same row.
  await db
    .insert(entitlements)
    .values(values)
    .onConflictDoUpdate({
      target: entitlements.userId,
      set: { ...values, updatedAt: new Date() },
    });

  // Fire the congrats email only on a genuine not-active → active flip. Renewals
  // (active → active) and lapses are silent here. Fire-and-forget; a mail failure
  // must never roll back a paid entitlement.
  if (priorStatus !== "active" && input.status === "active") {
    await notifyUser(input.userId, (r) =>
      subscribeConfirmationEmail({ name: r.name, plan: input.type }),
    );
  }
}

// Current row (thin projection) for the precedence rule below.
async function getExistingEntitlement(userId: string) {
  const { db } = await import("@/lib/db");
  const { entitlements } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select({
      type: entitlements.type,
      status: entitlements.status,
      polarSubscriptionId: entitlements.polarSubscriptionId,
    })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);
  return row ?? null;
}

// Best-effort: stop a subscription from billing. Caller has already granted a
// higher-precedence entitlement (lifetime), so revoking loses no access.
async function revokeSubscription(subscriptionId: string) {
  try {
    await getPolar().subscriptions.revoke({ id: subscriptionId });
  } catch (err) {
    console.error("[reconcile] failed to revoke subscription:", err);
  }
}

export async function reconcileSubscription(
  data: PolarSubscriptionLike,
  forceStatus?: EntStatus,
) {
  const userId = data.customer?.externalId;
  if (!userId) return; // no external id → not one of our users

  // Precedence: lifetime > subscription. Once a user owns lifetime, subscription
  // events must NEVER downgrade the row — this covers the canceled/revoked events
  // fired by the upgrade auto-revoke below, plus any stray renewal for an old sub.
  const existing = await getExistingEntitlement(userId);
  if (existing?.type === "lifetime" && existing.status === "active") return;

  await upsertEntitlement({
    userId,
    type: "subscription",
    status: forceStatus ?? effectiveStatus(data),
    polarCustomerId: data.customerId,
    polarSubscriptionId: data.id,
    polarProductId: data.productId,
    currentPeriodEnd: data.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
  });
}

export async function reconcileLifetimeOrder(data: PolarOrderLike) {
  // Only the one-time lifetime product; subscription orders are covered by the
  // subscription events above.
  if (!lifetimeProductId || data.productId !== lifetimeProductId) return;
  const userId = data.customer?.externalId;
  if (!userId) return;

  // Capture any active subscription BEFORE the upsert overwrites (nulls) it.
  const existing = await getExistingEntitlement(userId);
  const priorSubscriptionId =
    existing?.type === "subscription" ? existing.polarSubscriptionId : null;

  // Flip the row to lifetime FIRST — so the revoke's own subscription.canceled/
  // revoked webhooks (which arrive next) are skipped by the precedence guard above.
  await upsertEntitlement({
    userId,
    type: "lifetime",
    status: "active",
    polarCustomerId: data.customerId,
    polarOrderId: data.id,
    polarProductId: data.productId,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });

  // Stop the old subscription from billing. They now own lifetime, so revoking
  // immediately loses no access. Polar doesn't prorate recurring → one-time.
  if (priorSubscriptionId) await revokeSubscription(priorSubscriptionId);
}

// PULL reconcile — the webhook-independent backstop. On checkout return we read the
// customer's real state from Polar's API and rebuild the entitlement row, so a
// missed webhook (tunnel down, deploy window, Polar retry gap) never leaves a paying
// customer without access. Self-contained about precedence + revoke because a cold
// sync has no prior DB row to key off (unlike the webhook's event-by-event path).
export async function syncEntitlementForUser(userId: string): Promise<void> {
  const polar = getPolar();

  // Gather Polar's truth for this external customer in parallel.
  const [lifetimeOrders, activeSubs] = await Promise.all([
    lifetimeProductId
      ? polar.orders.list({
          externalCustomerId: userId,
          productId: lifetimeProductId,
        })
      : null,
    polar.subscriptions.list({ externalCustomerId: userId, active: true }),
  ]);

  // Chargeback defense (copy-paste product = access is irreversible once granted): a
  // refunded/void lifetime order keeps paid=true but its status flips. It must NOT
  // grant lifetime, else someone who buys, copies everything, then disputes via their
  // bank keeps Pro for free. Lifetime is non-refundable by policy; this covers the
  // involuntary path (chargeback/dispute) that policy alone can't stop.
  const paidLifetime =
    lifetimeOrders?.result.items.find(
      (o) => o.paid && o.status !== "refunded" && o.status !== "void",
    ) ?? null;
  const activeSub = activeSubs.result.items[0] ?? null;

  // Precedence: a paid lifetime order wins. Grant lifetime, then revoke any live
  // subscription (stop double billing) — mirrors the upgrade path, but self-contained
  // since the DB row may be empty during a cold sync.
  if (paidLifetime) {
    await upsertEntitlement({
      userId,
      type: "lifetime",
      status: "active",
      polarCustomerId: paidLifetime.customerId,
      polarOrderId: paidLifetime.id,
      polarProductId: paidLifetime.productId,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    if (activeSub) await revokeSubscription(activeSub.id);
    return;
  }

  if (activeSub) {
    await reconcileSubscription({
      id: activeSub.id,
      status: activeSub.status,
      productId: activeSub.productId,
      customerId: activeSub.customerId,
      currentPeriodEnd: activeSub.currentPeriodEnd,
      cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
      customer: { externalId: userId },
    });
  }
}
