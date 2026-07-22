"use client";

import Link from "next/link";
import { LogIn, Search } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { useAuthUser } from "@/hooks/use-auth-user";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import AuthMenu from "./AuthMenu";
import Wordmark from "@/components/Wordmark";
import GithubIcon from "../icons/github";

export default function MobileBar() {
	const toggleSidebar = useUIStore((state) => state.toggleSidebar);
	const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
	const { user, ready, signIn } = useAuthUser();

	return (
		<div className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-3 py-3 backdrop-blur lg:hidden h-10">
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
				{ready && user ? (
					<AuthMenu />
				) : (
					<>
						<FavoritesLink />
						<ThemeToggle />
						{ready ? (
							<button
								type="button"
								onClick={signIn}
								aria-label="Sign in with GitHub"
								className="grid size-7 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
							>
								<GithubIcon className="size-4" aria-hidden />
							</button>
						) : (
							<div
								className="size-7 animate-pulse rounded-md border border-hairline bg-panel"
								aria-hidden
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}
