"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as reconcile from "@/lib/favorites/reconcile";

// Persisted, per-browser collection of favorited components, keyed by entry.slug.
// Separate from useUIStore (ephemeral chrome) — favorites are durable user data.
// Its own localStorage key so it never collides with the sidebar-width store (sg-ui).
interface FavoritesState {
  /** Favorited slugs, newest first (insertion order). */
  slugs: string[];
  add: (slug: string) => void;
  remove: (slug: string) => void;
  toggle: (slug: string) => void;
  has: (slug: string) => boolean;
  clear: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      slugs: [],
      // The store holds the list; lib/favorites/reconcile decides what the list
      // should be. Ordering and dedupe rules live there so the sync island and
      // the API route apply the identical ones.
      add: (slug) => set((state) => ({ slugs: reconcile.add(state.slugs, slug) })),
      remove: (slug) =>
        set((state) => ({ slugs: reconcile.remove(state.slugs, slug) })),
      toggle: (slug) =>
        set((state) => ({ slugs: reconcile.toggle(state.slugs, slug) })),
      has: (slug) => get().slugs.includes(slug),
      clear: () => set({ slugs: [] }),
    }),
    {
      name: "sg-favorites",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // localStorage is user-writable, so what comes back is `unknown`, not
      // string[]. Rehydration used to trust it outright — a hand-edited blob
      // could put a duplicate or a non-string into the list and every consumer
      // downstream inherited it. No registry check here on purpose: that would
      // pull the whole registry into the shell bundle, and the API route already
      // whitelists on the way in and returns the authoritative set.
      merge: (persisted, current) => ({
        ...current,
        slugs: reconcile.sanitize(
          (persisted as { slugs?: unknown } | undefined)?.slugs,
        ),
      }),
    },
  ),
);

/** Reactive membership check for a single slug. */
export const useIsFavorite = (slug: string) =>
  useFavoritesStore((state) => state.slugs.includes(slug));

/** Reactive favorite count (for the top-bar badge). */
export const useFavoriteCount = () =>
  useFavoritesStore((state) => state.slugs.length);

/**
 * True once the persisted store has rehydrated from localStorage. Consumers hold
 * a neutral state until then to avoid an SSR/client hydration mismatch — same
 * discipline as ThemeToggle's `mounted` gate.
 */
export function useFavoritesHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useFavoritesStore.persist.hasHydrated()) setHydrated(true);
    const unsub = useFavoritesStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    return unsub;
  }, []);
  return hydrated;
}
