import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// New-style publishable key (`sb_publishable_…`) is preferred; legacy anon (JWT) key
// is accepted as a fallback for compatibility.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// True once Supabase creds are in the environment. Callers guard on this so the app
// runs normally (no auth, Pro via dev override only) before credentials are dropped in.
export function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// Cookie-bound server client for RSCs, Server Actions, and Route Handlers.
// `setAll` swallows its throw: during a Server Component render cookies can't be
// written — the proxy refreshes the session on the next request instead.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from an RSC render — safe to ignore (proxy handles refresh).
          }
        },
      },
    },
  );
}
