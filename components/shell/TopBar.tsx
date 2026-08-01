"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import CookBookIcon from "@/components/icons/cook-book";
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
	const pathname = usePathname();

	const isCookbook = pathname === "/cookbook";

	// Show the right modifier hint per platform (SSR-safe, hydration-consistent).
	const isMac = useIsMac();
	const { play, hoverProps } = useInteractionSound();

	return (
		<div className="sticky top-0 z-20 hidden h-10 md:h-14 items-center gap-3 border-b border-hairline bg-surface/80 px-3 backdrop-blur lg:flex lg:px-4">
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
				<Link
					href="/cookbook"
					aria-label="Motion cook book"
					title="Motion cook book"
					aria-current={isCookbook ? "page" : undefined}
					{...hoverProps()}
					onClick={() => play("select")}
					className={`grid size-7 place-items-center rounded-md border border-hairline transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none md:size-8 ${
						isCookbook ? "text-accent" : "text-ink-dim"
					}`}
				>
					<CookBookIcon open={isCookbook} className="size-4" aria-hidden />
				</Link>
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
