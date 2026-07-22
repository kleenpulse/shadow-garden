"use client";

import { useEffect, useRef } from "react";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useFavoritesStore } from "@/lib/favorites-store";

// The bridge between the offline-first localStorage favorites store and the
// server-backed `favorites` table. Renders nothing; mounted once in the shell.
//   - On sign-in: merge local favorites UP to the account, then adopt the server's
//     full set (merge-then-replace — offline adds are captured by the merge before
//     the replace, so nothing is lost, and cross-device removes propagate).
//   - On toggle while signed in: diff the store against the last-synced snapshot
//     and write the delta through (POST adds / DELETE removes), debounced.
//   - On sign-out: stop syncing; localStorage stays as the anonymous store.
export default function FavoritesSync() {
  const { user, ready } = useAuthUser();
  const userId = user?.id ?? null;

  // The server's known slug set — the baseline the store is diffed against. Null
  // until the initial merge lands (writes are held back until then).
  const snapshot = useRef<Set<string> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge-then-replace on sign-in; tear down on sign-out.
  useEffect(() => {
    if (!ready) return;

    if (!userId) {
      snapshot.current = null;
      return;
    }

    let cancelled = false;
    const localSlugs = useFavoritesStore.getState().slugs;

    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: localSlugs }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { slugs?: string[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.slugs)) return;
        // Set the snapshot BEFORE the store update so the subscription below sees
        // no diff for this adoption (server === store) and stays quiet.
        snapshot.current = new Set(data.slugs);
        useFavoritesStore.setState({ slugs: data.slugs });
      })
      .catch(() => {
        // Offline / unconfigured — leave the local store untouched.
      });

    return () => {
      cancelled = true;
    };
  }, [userId, ready]);

  // Write-through: on any store change while signed in, diff vs snapshot and sync.
  useEffect(() => {
    if (!ready || !userId) return;

    const sync = () => {
      const snap = snapshot.current;
      if (!snap) return; // initial merge hasn't landed yet
      const current = new Set(useFavoritesStore.getState().slugs);

      const added = [...current].filter((s) => !snap.has(s));
      const removed = [...snap].filter((s) => !current.has(s));
      if (added.length === 0 && removed.length === 0) return;

      // Advance the snapshot up front so overlapping toggles don't double-send.
      snapshot.current = current;

      for (const slug of added) {
        void fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        }).catch(() => {});
      }
      for (const slug of removed) {
        void fetch("/api/favorites", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        }).catch(() => {});
      }
    };

    const unsub = useFavoritesStore.subscribe(() => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(sync, 300);
    });

    return () => {
      unsub();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [userId, ready]);

  return null;
}
