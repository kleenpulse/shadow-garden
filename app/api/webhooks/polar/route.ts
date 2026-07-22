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

export const POST = webhookSecret
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
        { received: false, error: "Polar webhook not configured" },
        { status: 503 },
      );
