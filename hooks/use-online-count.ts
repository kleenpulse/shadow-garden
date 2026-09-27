"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";

export type PresenceKind = "auth" | "anon";

interface OnlineCount {
  configured: boolean;
  /** True after the first presence "sync" — before that the number is unknown, not zero. */
  ready: boolean;
  /** Distinct identities present. */
  total: number;
}

// Per-browser anonymous id. The httpOnly `sg_vid` cookie (server-side view dedup)
// is unreadable from JS, so presence carries its own client-side id — persisted
// so multiple tabs of one visitor dedupe to a single count.
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
//
// The payload is { kind } — the admin console (admin_shadow-garden, hooks/
// use-presence.ts) observes this channel and splits members from guests on it.
export function useOnlineCount(kind: PresenceKind = "anon"): OnlineCount {
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  // Read by the subscribe callback, which is registered once; the effect below
  // re-tracks on sign-in/out without tearing the channel down.
  const kindRef = useRef(kind);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabaseConfiguredClient) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel("presence:lobby", {
      config: { presence: { key: anonId() } },
    });

    channel.on("presence", { event: "sync" }, () => {
      setTotal(Object.keys(channel.presenceState()).length);
      setReady(true);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channelRef.current = channel;
        channel.track({ kind: kindRef.current });
      }
    });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    kindRef.current = kind;
    channelRef.current?.track({ kind });
  }, [kind]);

  return {
    configured: supabaseConfiguredClient,
    // Unconfigured → nothing to await; treat as ready so the deck can bow out cleanly.
    ready: supabaseConfiguredClient ? ready : true,
    total,
  };
}
