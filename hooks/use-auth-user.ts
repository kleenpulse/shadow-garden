"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";

// Shared Supabase session wiring for the header islands (AuthMenu's dropdown,
// MobileBar's signed-out row). Renders nothing until Supabase is configured.
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  // Unconfigured means there's no session to await — ready immediately.
  const [ready, setReady] = useState(!supabaseConfiguredClient);

  useEffect(() => {
    if (!supabaseConfiguredClient) return;
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    if (!supabaseConfiguredClient) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          window.location.pathname,
        )}`,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfiguredClient) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return { user, ready, configured: supabaseConfiguredClient, signIn, signOut };
}
