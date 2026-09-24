import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Supabase's PKCE auth code is a UUID. Matching the shape keeps an unrelated
// `?code=` on the home page from being hijacked into the auth callback.
const AUTH_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Next 16 renamed Middleware → Proxy. Same mechanism: this refreshes the Supabase
// auth session on every matched request so RSCs and Route Handlers see a live session.
export async function proxy(request: NextRequest) {
  // When an OAuth `redirectTo` isn't on the Supabase project's Redirect URLs
  // allow-list (a domain change is enough), Supabase silently falls back to the
  // bare Site URL and the code lands on "/", where nothing exchanges it — the
  // user comes back signed out. Hand it to the real callback so sign-in still
  // completes; only the `next` return path is lost. The allow-list is still the
  // fix — this is the safety net.
  const { pathname, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (pathname === "/" && code && AUTH_CODE.test(code)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = "";
    url.searchParams.set("code", code);
    url.searchParams.set("next", "/");
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, the image optimizer, favicon, and the
    // Polar webhook (no user session; must not have its cookies touched).
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks/polar|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
