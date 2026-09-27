"use client";

import { useEffect, useState } from "react";
import { useOnlineCount, type PresenceKind } from "@/hooks/use-online-count";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";

// Joins every visitor to the "presence:lobby" channel from the root layout, so
// the admin console's "online now" counts the whole site, not one page. Renders
// nothing — the landing's visible PresenceDeck was retired (524325e); the
// tracking must not depend on any UI being mounted.
//
// Session via onAuthStateChange, not useAuthUser: INITIAL_SESSION reads the
// local session with no network round-trip, and this island shouldn't carry the
// Pro-cache side effects that hook owns.
export function PresenceBeacon() {
  const [kind, setKind] = useState<PresenceKind>("anon");

  useEffect(() => {
    if (!supabaseConfiguredClient) return;
    const supabase = createSupabaseBrowserClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setKind(session?.user ? "auth" : "anon");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useOnlineCount(kind);
  return null;
}
