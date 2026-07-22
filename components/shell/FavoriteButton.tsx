"use client";

import { type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import {
  useFavoritesStore,
  useIsFavorite,
  useFavoritesHydrated,
} from "@/lib/favorites-store";
import { trackEvent } from "@/lib/stats/track";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  slug: string;
  /** Component display name — used for the accessible label and the toast. */
  name?: string;
  /** Extra classes for sizing / positioning / border from the caller. */
  className?: string;
  /** Heart glyph size in px. */
  iconSize?: number;
}

export default function FavoriteButton({
  slug,
  name,
  className,
  iconSize = 16,
}: FavoriteButtonProps) {
  const hydrated = useFavoritesHydrated();
  const favorited = useIsFavorite(slug);
  const toggle = useFavoritesStore((state) => state.toggle);

  // Hold a neutral (unfilled) state until the persisted store rehydrates, so SSR
  // and the first client paint agree.
  const isFav = hydrated && favorited;
  const label = name ?? "component";

  const onClick = (event: MouseEvent) => {
    // These buttons sit over a card-sized <Link>; a toggle must never navigate.
    event.preventDefault();
    event.stopPropagation();
    if (!hydrated) return;
    toggle(slug);
    // `favorited` is the state BEFORE the toggle: true means we just removed it.
    if (favorited) {
      toast(`Removed ${label} from favorites`);
      trackEvent(slug, "unfavorited");
    } else {
      toast.success(`Added ${label} to favorites`);
      trackEvent(slug, "favorited");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isFav}
      aria-label={
        isFav ? `Remove ${label} from favorites` : `Add ${label} to favorites`
      }
      title={isFav ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "inline-grid place-items-center rounded-md p-1.5 text-ink-mute transition",
        "hover:text-accent focus-visible:text-accent focus-visible:outline-none",
        "motion-safe:active:scale-90",
        isFav && "text-accent",
        className,
      )}
    >
      <Heart
        aria-hidden
        style={{ width: iconSize, height: iconSize }}
        className={isFav ? "fill-accent" : "fill-none"}
      />
    </button>
  );
}
