import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { has, supabaseKey, supabaseUrl } from "@/lib/capabilities";

// Runs in the Proxy (edge). Refreshes the Supabase auth session and rewrites the
// auth cookies onto the response. Never import Drizzle/postgres-js here — edge runtime.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Not configured yet — pass the request through unchanged.
  if (!has("supabase")) return response;

  // No auth cookie means no session to refresh, and getUser() would be a network
  // round-trip to Supabase to be told so. The matcher covers every HTML document,
  // so without this guard every anonymous visitor and every crawler pays that
  // latency before TTFB on every page. Supabase SSR writes all of its cookies
  // under an `sb-` prefix (auth token, its chunked `.0`/`.1` parts, and the PKCE
  // code verifier), so their absence is a sound signal that there is nothing here
  // to refresh.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(supabaseUrl()!, supabaseKey()!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not run any logic between creating the client and getUser() — Supabase SSR
  // guidance: this call is what triggers the token refresh + cookie rewrite.
  await supabase.auth.getUser();

  return response;
}
