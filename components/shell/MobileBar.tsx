"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import CookBookIcon from "@/components/icons/cook-book";
import { useUIStore } from "@/lib/store";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import AuthMenu from "./AuthMenu";
import Wordmark from "@/components/Wordmark";

// `commerce` is resolved server-side in the (shell) layout — armed deployments
// only. The Go Pro CTA is desktop-only; mobile gets the account menu, whose
// dropdown carries its own bottom utility row.
export default function MobileBar({ commerce = false }: { commerce?: boolean }) {
	const t = useTranslations("chrome.mobileBar");
	const tc = useTranslations("common");
	const toggleSidebar = useUIStore((state) => state.toggleSidebar);
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const { play, hoverProps } = useInteractionSound();
	const pathname = usePathname();

	const isCookbook = pathname === "/cookbook";

	return (
		<div className="sticky top-0 z-20 flex h-10 items-center gap-2 bg-panel/90 px-2 backdrop-blur lg:hidden">
			<button
				type="button"
				onClick={toggleSidebar}
				aria-label={t("openNavigation")}
				className="grid size-7 shrink-0 place-items-center rounded-md bg-surface text-ink-dim hover:text-accent"
			>
				<span aria-hidden className="text-base leading-none">
					≡
				</span>
			</button>
			<Link
				href={pathname === "/components" ? "/" : "/components"}
				className="inline-flex min-w-0 shrink-0 items-baseline"
			>
				<Wordmark size="xs" />
			</Link>

			<div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					aria-label={tc("search")}
					className="grid size-7 place-items-center rounded-md bg-surface text-ink-dim hover:text-accent"
				>
					<Search className="h-4 w-4" aria-hidden />
				</button>
				<Link
					href="/cookbook"
					aria-label={t("cookbookLabel")}
					title={t("cookbookLabel")}
					aria-current={isCookbook ? "page" : undefined}
					{...hoverProps()}
					onClick={() => play("select")}
					className={`grid size-7 place-items-center rounded-md bg-surface transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none ${
						isCookbook ? "text-accent" : "text-ink-dim"
					}`}
				>
					<CookBookIcon open={isCookbook} className="size-4" aria-hidden />
				</Link>
				<FavoritesLink />
				<ThemeToggle />
				{commerce && <AuthMenu />}
			</div>
		</div>
	);
}
