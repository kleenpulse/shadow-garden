import { NextResponse } from "next/server";
import { getPolar, polarConfigured } from "@/lib/polar";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getCurrentUserClaims } from "@/lib/supabase/current-user";

// Route handlers run on the Node runtime by default — no `export const runtime`
// (Cache Components forbids the route-segment runtime config).

// Starts a Polar checkout for the requested plan. The authenticated Supabase user id
// is injected server-side as externalCustomerId — Polar echoes it back on every
// webhook, giving a spoof-proof mapping from purchase → account (no client trust).
//   GET /api/checkout?plan=lifetime|subscription
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const plan =
    searchParams.get("plan") === "lifetime" ? "lifetime" : "subscription";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  if (!polarConfigured() || !supabaseConfigured()) {
    return NextResponse.redirect(`${site}/components?checkout_error=unconfigured`);
  }

  const productId =
    plan === "lifetime"
      ? process.env.POLAR_PRODUCT_ID_LIFETIME
      : process.env.POLAR_PRODUCT_ID_SUBSCRIPTION;
  if (!productId) {
    return NextResponse.redirect(`${site}/components?checkout_error=no_product`);
  }

  // A purchase must be bound to a signed-in account.
  const claims = await getCurrentUserClaims();
  const userId = claims?.sub;
  const email = claims?.email;
  if (!userId) {
    return NextResponse.redirect(`${site}/components?checkout_error=signin_required`);
  }

  try {
    const polar = getPolar();
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${site}/components?checkout=success`,
      externalCustomerId: userId,
      customerEmail: email,
    });
    return NextResponse.redirect(checkout.url);
  } catch (err) {
    // Surface the real Polar error server-side; the user still gets a clean redirect.
    console.error("[checkout] Polar checkout create failed:", err);
    return NextResponse.redirect(`${site}/components?checkout_error=failed`);
  }
}
