"use client";

import Link from "next/link";
import { Heart, Search } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { useFavoriteCount, useFavoritesHydrated } from "@/lib/favorites-store";
import { useIsMac } from "@/hooks/use-is-mac";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import ThemeToggle from "./ThemeToggle";
import SoundControl from "./SoundControl";

// Slim desktop chrome strip: palette trigger on the left, favorites + theme on
// the right. Hidden on mobile — MobileBar carries the same affordances there.
export default function TopBar() {
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const hydrated = useFavoritesHydrated();
	const count = useFavoriteCount();

	// Show the right modifier hint per platform (SSR-safe, hydration-consistent).
	const isMac = useIsMac();
	const { play, hoverProps } = useInteractionSound();

	return (
		<div className="sticky top-0 z-20 hidden h-10 md:h-14 items-center gap-3 border-b border-hairline bg-surface/80 px-4 backdrop-blur lg:flex lg:px-8">
			<button
				type="button"
				onClick={() => {
					play("open");
					setPaletteOpen(true);
				}}
				{...hoverProps()}
				className="group flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-hairline bg-panel px-3 text-left text-ink-mute transition-colors hover:border-accent-muted hover:text-ink-dim"
			>
				<Search className="h-4 w-4" aria-hidden />
				<span className="flex-1 font-sans text-sm">Search components…</span>
				<kbd className="rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink-mute">
					{isMac ? "⌘K" : "Ctrl K"}
				</kbd>
			</button>

			<div className="ml-auto flex items-center gap-2">
				<Link
					href="/favorites"
					aria-label={
						hydrated && count > 0 ? `Favorites (${count})` : "Favorites"
					}
					{...hoverProps()}
					onClick={() => play("select")}
					className="relative grid h-8 w-8 place-items-center rounded-md border border-hairline text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
				>
					<Heart className="h-4 w-4" aria-hidden />
					{hydrated && count > 0 && (
						<span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-on-accent">
							{count}
						</span>
					)}
				</Link>
				<SoundControl />
				<ThemeToggle />
			</div>
		</div>
	);
}
