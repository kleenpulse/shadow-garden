"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import CookBookIcon from "@/components/icons/cook-book";
import { useUIStore } from "@/lib/store";
import { useIsMac } from "@/hooks/use-is-mac";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import LanguagePicker from "./LanguagePicker";
import GithubIcon from "../icons/github";

// Slim desktop chrome strip: palette trigger on the left, favorites + theme on
// the right. Hidden on mobile — MobileBar carries the same affordances there.
export default function TopBar() {
	const t = useTranslations("chrome.topBar");
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const pathname = usePathname();

	const isCookbook = pathname === "/cookbook";

	// Show the right modifier hint per platform (SSR-safe, hydration-consistent).
	const isMac = useIsMac();

	return (
		<div className="sticky top-0 z-20 hidden h-10 md:h-14 items-center gap-3 border-b border-hairline bg-surface/80 px-3 backdrop-blur lg:flex lg:px-4">
			<button
				type="button"
				onClick={() => setPaletteOpen(true)}
				className="group flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-hairline bg-panel px-3 text-start text-ink-mute transition-colors hover:border-accent-muted hover:text-ink-dim"
			>
				<Search className="h-4 w-4" aria-hidden />
				<span className="flex-1 font-sans text-sm">{t("searchPlaceholder")}</span>
				<kbd className="rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink-mute">
					{isMac ? "⌘K" : "Ctrl K"}
				</kbd>
			</button>

			<div className="ms-auto flex items-center gap-2">
				<Link
					href="/cookbook"
					aria-label={t("cookbookLabel")}
					title={t("cookbookLabel")}
					aria-current={isCookbook ? "page" : undefined}
					className={`grid size-7 place-items-center rounded-md  transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none md:size-8 ${
						isCookbook ? "text-accent" : "text-ink-dim"
					}`}
				>
					<CookBookIcon open={isCookbook} className="size-full" aria-hidden />
				</Link>
				<FavoritesLink className="h-8 w-8" />
				<LanguagePicker />
				<ThemeToggle />
				<a
					href="https://github.com/kleenpulse/shadow-garden"
					target="_blank"
					rel="noreferrer"
					aria-label={t("githubLabel")}
					title={t("githubLabel")}
					className="grid size-7 place-items-center rounded-md text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none md:size-8"
				>
					<GithubIcon className="size-4" aria-hidden />
				</a>
			</div>
		</div>
	);
}
