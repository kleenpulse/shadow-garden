"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import CookBookIcon from "@/components/icons/cook-book";
import { useUIStore } from "@/lib/store";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import Wordmark from "@/components/Wordmark";
import GithubIcon from "../icons/github";

export default function MobileBar() {
	const t = useTranslations("chrome.mobileBar");
	const tc = useTranslations("common");
	const toggleSidebar = useUIStore((state) => state.toggleSidebar);
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const pathname = usePathname();

	const isCookbook = pathname === "/cookbook";

	return (
		<div className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-2 py-3 backdrop-blur lg:hidden h-10">
			<button
				type="button"
				onClick={toggleSidebar}
				aria-label={t("openNavigation")}
				className="grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
			>
				<span aria-hidden className="text-base leading-none">
					≡
				</span>
			</button>
			<Link
				href={pathname === "/components" ? "/" : "/components"}
				className="inline-flex items-baseline"
			>
				<Wordmark size="xs" />
			</Link>

			<div className="ml-auto flex items-center gap-2">
				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					aria-label={tc("search")}
					className="grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
				>
					<Search className="h-4 w-4" aria-hidden />
				</button>
				<Link
					href="/cookbook"
					aria-label={t("cookbookLabel")}
					title={t("cookbookLabel")}
					aria-current={isCookbook ? "page" : undefined}
					className={`grid size-7 place-items-center rounded-md border border-hairline transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none ${
						isCookbook ? "text-accent" : "text-ink-dim"
					}`}
				>
					<CookBookIcon open={isCookbook} className="size-4" aria-hidden />
				</Link>
				<FavoritesLink />
				<ThemeToggle />
				<a
					href="https://github.com/kleenpulse/shadow-garden"
					target="_blank"
					rel="noreferrer"
					aria-label={t("githubLabel")}
					title={t("githubLabel")}
					className="grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
				>
					<GithubIcon className="size-4" aria-hidden />
				</a>
			</div>
		</div>
	);
}
