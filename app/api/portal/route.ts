import { NextResponse } from "next/server";
import { getPolar, polarConfigured } from "@/lib/polar";
import {
  createSupabaseServerClient,
  supabaseConfigured,
} from "@/lib/supabase/server";

// Redirects a signed-in member to their pre-authenticated Polar Customer Portal —
// which handles cancel, change payment method, invoices/receipts, and the renewal
// date (payment-method is portal-only for PCI). Mirrors the checkout route's guard +
// error-redirect shape. Node runtime by default (no runtime export under Cache Components).
//   GET /api/portal
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  if (!polarConfigured() || !supabaseConfigured()) {
    return NextResponse.redirect(`${site}/components?portal_error=unconfigured`);
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return NextResponse.redirect(
      `${site}/components?portal_error=signin_required`,
    );
  }

  try {
    const polar = getPolar();
    // externalCustomerId = the Supabase uid we bound at checkout → pre-authenticated.
    // returnUrl carries a deterministic ?portal=1 signal so the client reconciles
    // entitlement on return (cancel/uncancel/payment change) without waiting on the
    // webhook — the same self-heal the checkout return uses.
    const session = await polar.customerSessions.create({
      externalCustomerId: userId,
      returnUrl: `${site}/components?portal=1`,
    });
    return NextResponse.redirect(session.customerPortalUrl);
  } catch (err) {
    // Most likely: user isn't a Polar customer yet (never purchased).
    console.error("[portal] customer session create failed:", err);
    return NextResponse.redirect(`${site}/components?portal_error=failed`);
  }
}
