import { NextResponse } from "next/server";
import { polarConfigured } from "@/lib/polar";
import { supabaseConfigured } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/supabase/current-user";
import { syncEntitlementForUser } from "@/lib/polar/reconcile";
import { getBilling } from "@/lib/registry/billing";

// Checkout-return reconcile (PULL). The client hits this the moment the user lands
// back from Polar, so entitlement is granted from Polar's own API even if the webhook
// was never delivered (tunnel down / deploy window / retry gap). Idempotent + safe to
// re-hit. Node runtime by default (no runtime export under Cache Components).
//   POST /api/checkout/sync → { pro, ... billing summary }
export async function POST() {
  if (!polarConfigured() || !supabaseConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json(
      { pro: false, error: "unconfigured" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { pro: false, error: "signin_required" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await syncEntitlementForUser(userId);
  } catch (err) {
    // Non-fatal: the webhook is the other backstop. Surface server-side, still return
    // the current billing state so the client can reflect whatever did land.
    console.error("[checkout/sync] reconcile failed:", err);
  }

  const billing = await getBilling();
  return NextResponse.json(billing, {
    headers: { "Cache-Control": "no-store" },
  });
}
