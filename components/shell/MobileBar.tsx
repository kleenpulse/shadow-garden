"use client";

import Link from "next/link";
import { Heart, Search } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { useFavoriteCount, useFavoritesHydrated } from "@/lib/favorites-store";
import ThemeToggle from "./ThemeToggle";
import SoundToggle from "./SoundToggle";
import Wordmark from "@/components/Wordmark";

export default function MobileBar() {
	const toggleSidebar = useUIStore((state) => state.toggleSidebar);
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const hydrated = useFavoritesHydrated();
	const count = useFavoriteCount();

	return (
		<div className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-4 py-3 backdrop-blur lg:hidden h-10">
			<button
				type="button"
				onClick={toggleSidebar}
				aria-label="Open navigation"
				className="grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
			>
				<span aria-hidden className="text-base leading-none">
					≡
				</span>
			</button>
			<Link href="/" className="inline-flex items-baseline">
				<Wordmark size="xs" />
			</Link>

			<div className="ml-auto flex items-center gap-2">
				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					aria-label="Search"
					className="grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
				>
					<Search className="h-4 w-4" aria-hidden />
				</button>
				<Link
					href="/favorites"
					aria-label={
						hydrated && count > 0 ? `Favorites (${count})` : "Favorites"
					}
					className="relative grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
				>
					<Heart className="h-4 w-4" aria-hidden />
					{hydrated && count > 0 && (
						<span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-on-accent">
							{count}
						</span>
					)}
				</Link>
				<SoundToggle />
				<ThemeToggle />
			</div>
		</div>
	);
}
