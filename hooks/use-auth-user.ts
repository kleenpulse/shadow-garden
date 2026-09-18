"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";
import { invalidatePro } from "./use-pro";

// Shared Supabase session wiring for the header islands (AuthMenu's dropdown,
// MobileBar's signed-out row). Renders nothing until Supabase is configured.
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  // Unconfigured means there's no session to await — ready immediately.
  const [ready, setReady] = useState(!supabaseConfiguredClient);

  // Whose entitlement the Pro cache currently holds. A token refresh re-fires
  // onAuthStateChange with the same user; only an identity change invalidates.
  const knownId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseConfiguredClient) return;
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

    // The session IS the Pro cache's key. Invalidating here rather than in each
    // island means a sign-out from anywhere drops the plan everywhere — the
    // account menu used to reset its own private copy and nothing else's.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      const nextId = nextUser?.id ?? null;
      if (knownId.current !== undefined && knownId.current !== nextId) {
        invalidatePro();
      }
      knownId.current = nextId;
      setUser(nextUser);
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
