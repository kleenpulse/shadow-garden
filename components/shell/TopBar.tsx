"use client";

import { Search } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { useIsMac } from "@/hooks/use-is-mac";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import SoundControl from "./SoundControl";
import AuthMenu from "./AuthMenu";
import GoProButton from "./GoProButton";

// Slim desktop chrome strip: palette trigger on the left, favorites + theme on
// the right. Hidden on mobile — MobileBar carries the same affordances there.
export default function TopBar() {
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);

	// Show the right modifier hint per platform (SSR-safe, hydration-consistent).
	const isMac = useIsMac();
	const { play, hoverProps } = useInteractionSound();

	return (
		<div className="sticky top-0 z-20 hidden h-10 md:h-14 items-center gap-3 border-b border-hairline bg-surface/80 px-4 backdrop-blur lg:flex lg:px-8">
			<button
				type="button"
				onClick={() => setPaletteOpen(true)}
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
				<GoProButton />
				<FavoritesLink
					{...hoverProps()}
					onClick={() => play("select")}
					className="h-8 w-8"
				/>
				<SoundControl />
				<ThemeToggle />
				<AuthMenu />
			</div>
		</div>
	);
}
