import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed Middleware → Proxy. Same mechanism: this refreshes the Supabase
// auth session on every matched request so RSCs and Route Handlers see a live session.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, the image optimizer, favicon, and the
    // Polar webhook (no user session; must not have its cookies touched).
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks/polar|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
