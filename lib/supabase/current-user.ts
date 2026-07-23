import "server-only";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export interface CurrentUserClaims {
  sub: string;
  email?: string;
}

// The one place `auth.getClaims()` is called. Verifies the JWT locally when signing
// keys are configured, avoiding a round-trip to the auth server. Never throws — an
// unconfigured environment, missing session, or auth hiccup all resolve to `null`,
// same as "not signed in".
export async function getCurrentUserClaims(): Promise<CurrentUserClaims | null> {
  if (!supabaseConfigured()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!sub) return null;
    const email =
      typeof data?.claims?.email === "string" ? data.claims.email : undefined;
    return { sub, email };
  } catch {
    return null;
  }
}

export async function currentUserId(): Promise<string | null> {
  const claims = await getCurrentUserClaims();
  return claims?.sub ?? null;
}
