"use client";

import { useEffect, useState } from "react";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";
import { useAuthUser } from "@/hooks/use-auth-user";

type Kind = "auth" | "anon";

interface OnlineCount {
  configured: boolean;
  /** True after the first presence "sync" — before that the numbers are unknown, not zero. */
  ready: boolean;
  /** Distinct signed-in identities present. */
  auth: number;
  /** Distinct anonymous identities present. */
  anon: number;
  total: number;
}

// Per-browser anonymous id. The httpOnly `sg_vid` cookie (server-side view dedup)
// is unreadable from JS, so anonymous presence carries its own client-side id —
// persisted so multiple tabs of one guest dedupe to a single count.
function anonId(): string {
  const KEY = "sg_anon_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// Live "who's here now" via a single Supabase Realtime presence channel. One global
// room ("presence:lobby"); presence is ephemeral (in-memory on the Realtime servers,
// auto-cleaned on disconnect) so there is no DB behind this. Counts are by distinct
// identity key, so opening N tabs as the same person still counts once.
//
// Scale note: presence syncs full channel state to every subscriber (O(N) fan-out).
// Fine for a showcase at tens of concurrent; revisit (throttle/sample) only if this
// ever reaches thousands.
export function useOnlineCount(): OnlineCount {
  const { user, ready: authReady } = useAuthUser();
  const [counts, setCounts] = useState({ auth: 0, anon: 0 });
  const [ready, setReady] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!supabaseConfiguredClient || !authReady) return;

    const supabase = createSupabaseBrowserClient();
    const kind: Kind = userId ? "auth" : "anon";
    const key = userId ?? anonId();

    const channel = supabase.channel("presence:lobby", {
      config: { presence: { key } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ kind: Kind }>();
      let auth = 0;
      let anon = 0;
      // presenceState() is keyed by identity; bucket each key by the kind its
      // (first) meta reports. One identity is one client → one kind.
      for (const metas of Object.values(state)) {
        if (metas[0]?.kind === "auth") auth += 1;
        else anon += 1;
      }
      setCounts({ auth, anon });
      setReady(true);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ kind });
    });

    return () => {
      supabase.removeChannel(channel);
    };
    // Re-subscribe when identity flips (sign in/out) so you move buckets live.
  }, [authReady, userId]);

  return {
    configured: supabaseConfiguredClient,
    // Unconfigured → nothing to await; treat as ready so the deck can bow out cleanly.
    ready: supabaseConfiguredClient ? ready : true,
    auth: counts.auth,
    anon: counts.anon,
    total: counts.auth + counts.anon,
  };
}
