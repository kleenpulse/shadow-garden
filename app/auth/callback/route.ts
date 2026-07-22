import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  supabaseConfigured,
} from "@/lib/supabase/server";

// OAuth/PKCE return leg: exchange the `code` for a session (sets auth cookies) and
// bounce the user back to where they started (`next`).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Only allow same-origin relative redirects.
  const dest = next.startsWith("/") ? next : "/";

  if (code && supabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/components?auth_error=1`);
}
