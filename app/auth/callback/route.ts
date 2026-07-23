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
      // This callback runs on EVERY login, so the welcome email must be claimed
      // exactly once: a conditional UPDATE that only matches while the marker is
      // still NULL. If a row comes back, we won the claim → send. Fire-and-forget
      // and fully guarded so a mail hiccup never breaks sign-in.
      await maybeSendWelcome(supabase);
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/components?auth_error=1`);
}

async function maybeSendWelcome(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (!userId) return;

    const { db } = await import("@/lib/db");
    const { profiles } = await import("@/lib/db/schema");
    const { and, eq, isNull } = await import("drizzle-orm");

    // Race-free single-fire claim: only one caller flips NULL → now().
    const [claimed] = await db
      .update(profiles)
      .set({ welcomeEmailSentAt: new Date() })
      .where(and(eq(profiles.id, userId), isNull(profiles.welcomeEmailSentAt)))
      .returning({ email: profiles.email, displayName: profiles.displayName });

    if (!claimed?.email) return;

    const { welcomeEmail } = await import("@/lib/email/templates");
    const { sendUserEmail } = await import("@/lib/email/notify");
    await sendUserEmail(
      { email: claimed.email, name: claimed.displayName },
      welcomeEmail({ name: claimed.displayName }),
    );
  } catch (err) {
    console.error("[email] welcome send failed", err);
  }
}
