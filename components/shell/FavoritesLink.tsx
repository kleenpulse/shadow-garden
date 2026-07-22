"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useFavoriteCount, useFavoritesHydrated } from "@/lib/favorites-store";
import { cn } from "@/lib/utils";

export default function FavoritesLink({
  className,
  onClick,
  onPointerEnter,
}: {
  className?: string;
  onClick?: () => void;
  onPointerEnter?: () => void;
}) {
  const hydrated = useFavoritesHydrated();
  const count = useFavoriteCount();

  return (
    <Link
      href="/favorites"
      aria-label={hydrated && count > 0 ? `Favorites (${count})` : "Favorites"}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      className={cn(
        "relative grid size-7 md:size-8 place-items-center rounded-md border border-hairline text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none",
        className,
      )}
    >
      <Heart className="h-4 w-4" aria-hidden />
      {hydrated && count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-on-accent">
          {count}
        </span>
      )}
    </Link>
  );
}
