import { Webhooks } from "@polar-sh/nextjs";
import { NextResponse } from "next/server";
import {
  reconcileLifetimeOrder,
  reconcileSubscription,
} from "@/lib/polar/reconcile";

// Polar webhook adapter (PUSH path). The @polar-sh/nextjs adapter verifies the
// standard-webhooks signature over the raw body; this route is Node-runtime (Drizzle)
// and is excluded from the proxy matcher (it carries no user session). Route handlers
// run on the Node runtime by default — no `export const runtime` (Cache Components
// forbids it). All reconciliation lives in lib/polar/reconcile.ts, shared with the
// checkout-return sync so a missed delivery here is self-healed on redirect.

const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

// Reconciliation writes the entitlements row, so a configured webhook with no
// DATABASE_URL cannot do its job. Refuse up front with 503 rather than letting
// reconcile throw mid-delivery: Polar retries a 5xx, and an opaque 500 from a
// deployment that will never have a DB is an infinite retry loop (§B.B4).
// 503 is still a retry signal — correct here, since the fix is configuration.
// Inlined rather than hoisted to a const so TS still narrows `webhookSecret`
// to `string` inside the true branch.
export const POST =
  webhookSecret && process.env.DATABASE_URL
    ? Webhooks({
        webhookSecret,
        onSubscriptionCreated: async (p) => reconcileSubscription(p.data),
        onSubscriptionActive: async (p) => reconcileSubscription(p.data),
        onSubscriptionUpdated: async (p) => reconcileSubscription(p.data),
        onSubscriptionUncanceled: async (p) => reconcileSubscription(p.data),
        onSubscriptionCanceled: async (p) => reconcileSubscription(p.data),
        onSubscriptionRevoked: async (p) =>
          reconcileSubscription(p.data, "revoked"),
        onOrderPaid: async (p) => reconcileLifetimeOrder(p.data),
      })
    : async () =>
        NextResponse.json(
          {
            received: false,
            error: webhookSecret
              ? "Polar webhook configured but DATABASE_URL is not set"
              : "Polar webhook not configured",
          },
          { status: 503 },
        );
