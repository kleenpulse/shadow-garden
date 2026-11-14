"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import CookBookIcon from "@/components/icons/cook-book";
import { useUIStore } from "@/lib/store";
import { useIsMac } from "@/hooks/use-is-mac";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import SoundControl from "./SoundControl";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import LanguagePicker from "./LanguagePicker";
import GithubIcon from "@/components/icons/github";
import { SITE_REPO } from "@/lib/site";

// Slim desktop chrome strip: palette trigger on the left, favorites + theme on
// the right. Hidden on mobile — MobileBar carries the same affordances there.
export default function TopBar() {
	const t = useTranslations("chrome.topBar");
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const { play, hoverProps } = useInteractionSound();
	const pathname = usePathname();

	const isCookbook = pathname === "/cookbook";

	// Show the right modifier hint per platform (SSR-safe, hydration-consistent).
	const isMac = useIsMac();

	return (
		<div className="sticky top-0 z-20 hidden h-10 md:h-14  items-center gap-3 bg-panel/80 px-3 backdrop-blur lg:flex lg:px-4">
			<button
				type="button"
				onClick={() => setPaletteOpen(true)}
				{...hoverProps()}
				className="group flex h-9 w-full max-w-40 xl:max-w-60 items-center gap-2 rounded-md border border-transparent bg-surface px-3 text-start text-ink-mute transition-colors hover:text-ink-dim focus-visible:border-accent focus-visible:outline-none"
			>
				<Search className="h-4 w-4" aria-hidden />
				<span className="truncate flex-1 font-sans text-xs">
					{t("searchPlaceholder")}
				</span>
				<kbd className="rounded bg-panel px-1.5 py-0.5 font-mono text-[10px] shrink-0 leading-none text-ink-mute">
					{isMac ? "⌘K" : "Ctrl K"}
				</kbd>
			</button>

			<div className="ms-auto flex items-center gap-2">
				<Link
					href="/cookbook"
					aria-label={t("cookbookLabel")}
					title={t("cookbookLabel")}
					aria-current={isCookbook ? "page" : undefined}
					{...hoverProps()}
					onClick={() => play("select")}
					className={`grid size-7 place-items-center rounded-md  transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none md:size-8 ${
						isCookbook ? "text-accent" : "text-ink-dim"
					}`}
				>
					<CookBookIcon open={isCookbook} className="size-full" aria-hidden />
				</Link>
				<FavoritesLink className="h-8 w-8" />
				<SoundControl />
				<LanguagePicker />
				<ThemeToggle />
				<a
					href={SITE_REPO}
					target="_blank"
					rel="noreferrer"
					aria-label={t("githubLabel")}
					title={t("githubLabel")}
					className="grid size-7 place-items-center rounded-md bg-surface text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none md:size-8"
				>
					<GithubIcon className="size-4" aria-hidden />
				</a>
			</div>
		</div>
	);
}
