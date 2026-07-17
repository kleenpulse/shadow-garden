"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
      add: (slug) =>
        set((state) =>
          state.slugs.includes(slug) ? state : { slugs: [slug, ...state.slugs] },
        ),
      remove: (slug) =>
        set((state) => ({ slugs: state.slugs.filter((s) => s !== slug) })),
      toggle: (slug) =>
        set((state) =>
          state.slugs.includes(slug)
            ? { slugs: state.slugs.filter((s) => s !== slug) }
            : { slugs: [slug, ...state.slugs] },
        ),
      has: (slug) => get().slugs.includes(slug),
      clear: () => set({ slugs: [] }),
    }),
    {
      name: "sg-favorites",
      version: 1,
      storage: createJSONStorage(() => localStorage),
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
