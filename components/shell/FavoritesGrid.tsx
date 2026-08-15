"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { getEntry } from "@/lib/registry";
import type { ComponentEntry } from "@/lib/registry/types";
import { useFavoritesStore, useFavoritesHydrated } from "@/lib/favorites-store";
import { ThumbnailSlotsProvider } from "./thumbnail-slots";
import FavoriteThumbnailCard from "./FavoriteThumbnailCard";

export default function FavoritesGrid() {
  const hydrated = useFavoritesHydrated();
  const slugs = useFavoritesStore((state) => state.slugs);
  const t = useTranslations("chrome.favorites");

  // Favorites live in localStorage — hold a skeleton until rehydrated so the
  // server-rendered shell doesn't flash a wrong (empty) state.
  if (!hydrated) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[16/10] animate-pulse rounded-lg border border-hairline bg-panel"
          />
        ))}
      </div>
    );
  }

  // Resolve slugs to entries, dropping any that were removed from the registry.
  const entries = slugs
    .map((slug) => getEntry(slug))
    .filter((entry): entry is ComponentEntry => Boolean(entry));

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline bg-panel/50 px-6 py-20 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-hairline text-ink-mute">
          <Heart className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
          {t("emptyTitle")}
        </h2>
        <p className="mt-2 max-w-sm font-sans text-sm text-ink-dim">
          {t("emptySubtitle")}
        </p>
        <Link
          href="/components"
          className="mt-5 rounded-md border border-hairline bg-panel px-4 py-2 font-mono text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
        >
          {t("browseComponents")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-ink-mute">
        {t("savedCount", { count: entries.length })}
      </p>
      <ThumbnailSlotsProvider max={6}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <FavoriteThumbnailCard key={entry.slug} entry={entry} />
          ))}
        </div>
      </ThumbnailSlotsProvider>
    </div>
  );
}
