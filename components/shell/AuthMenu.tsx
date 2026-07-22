"use client";

import { useEffect, useRef, useState } from "react";
import {
	ArrowUpRight,
	CreditCard,
	LogIn,
	LogOut,
	Sparkles,
} from "lucide-react";
import { supabaseConfiguredClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/hooks/use-auth-user";
import type { BillingSummary } from "@/lib/registry/billing";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import SoundToggle from "./SoundToggle";
import GithubIcon from "../icons/github";

// Auth-reactive header island. Lives OUTSIDE the static shell's server render so the
// layout never reads the session (which would collapse PPR). Signed-out → a "Sign in"
// button; signed-in → an avatar that opens the account dropdown (plan status, manage
// billing, upgrade to lifetime, sign out). Renders nothing until Supabase is configured.

const ITEM =
	"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-sans text-sm text-ink-dim transition-colors hover:bg-raised hover:text-ink focus-visible:bg-raised focus-visible:text-ink focus-visible:outline-none";

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// Pro plan badge + sub-line. Returns null for free users (they get an Upgrade item).
function planView(
	b: BillingSummary,
): { label: string; sub: string | null } | null {
	if (!b.pro) return null;
	if (b.type === "lifetime") return { label: "Lifetime", sub: "Yours forever" };
	if (b.type === "subscription") {
		const date = b.currentPeriodEnd ? formatDate(b.currentPeriodEnd) : null;
		let sub = "Active";
		if (b.status === "past_due") sub = "Payment overdue";
		else if (b.cancelAtPeriodEnd && date) sub = `Cancels ${date}`;
		else if (date) sub = `Renews ${date}`;
		return { label: "Membership", sub };
	}
	return { label: "Pro", sub: null };
}

export default function AuthMenu() {
	const { user, ready, signIn, signOut: signOutUser } = useAuthUser();
	const [menuOpen, setMenuOpen] = useState(false);
	const [billing, setBilling] = useState<BillingSummary | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Auth state changes (sign in/out) invalidate any billing snapshot fetched
	// under the previous session — reset during render (no effect) so the next
	// menu open re-fetches it.
	const userId = user?.id ?? null;
	const [billingForUserId, setBillingForUserId] = useState(userId);
	if (billingForUserId !== userId) {
		setBillingForUserId(userId);
		setBilling(null);
	}

	// Prefetch billing the moment the session is known (sign-in, or a page load with an
	// existing session) — NOT on menu-open. The first /api/billing hits a cold pooler +
	// Drizzle lookup; doing it eagerly means the dropdown shows the plan instantly
	// instead of stalling on "Loading…". `menuOpen` stays a dependency so that if the
	// prefetch failed while the menu was closed, opening it retries (billing still null).
	useEffect(() => {
		if (!userId || billing) return;
		let active = true;
		fetch("/api/billing", { cache: "no-store" })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (active && d) setBilling(d as BillingSummary);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [userId, billing, menuOpen]);

	// Close on click-outside + Escape.
	useEffect(() => {
		if (!menuOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setMenuOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [menuOpen]);

	const signOut = async () => {
		setMenuOpen(false);
		await signOutUser();
		setBilling(null);
	};

	if (!supabaseConfiguredClient) return null;

	if (!ready) {
		return (
			<div
				className="h-8 w-8 animate-pulse rounded-md border border-hairline bg-panel"
				aria-hidden
			/>
		);
	}

	if (!user) {
		return (
			<button
				type="button"
				onClick={signIn}
				className="flex h-8 items-center gap-2 rounded-md border border-hairline px-3 font-sans text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent focus-visible:text-accent focus-visible:outline-none"
			>
				<GithubIcon className="size-4" aria-hidden />
				<span>Sign in with Github</span>
			</button>
		);
	}

	const label =
		(user.user_metadata?.user_name as string | undefined) ??
		(user.user_metadata?.full_name as string | undefined) ??
		user.email ??
		"Account";
	const initial = label.charAt(0).toUpperCase();
	const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
	const plan = billing ? planView(billing) : null;

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setMenuOpen((o) => !o)}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-label="Account menu"
				className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
			>
				{avatarUrl ? (
					// Plain <img> (not next/image) so no remotePatterns config is needed.
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={avatarUrl}
						alt={label}
						width={32}
						height={32}
						className="h-8 w-8 rounded-full border border-hairline object-cover"
					/>
				) : (
					<span className="grid h-8 w-8 place-items-center rounded-full border border-hairline bg-panel font-mono text-xs font-bold text-accent">
						{initial}
					</span>
				)}
			</button>

			{menuOpen && (
				<div
					role="menu"
					className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-hairline bg-panel p-1.5 pb-14 shadow-2xl lg:pb-1.5"
				>
					{/* Header */}
					<div className="px-3 py-2">
						<p className="truncate font-sans text-sm font-medium text-ink">
							{label}
						</p>
						{user.email && (
							<p className="truncate font-sans text-xs text-ink-mute">
								{user.email}
							</p>
						)}
					</div>

					<div className="my-1 h-px bg-hairline" />

					{/* Plan status */}
					{!billing ? (
						<div className="px-3 py-2 font-sans text-xs text-ink-mute">
							Loading…
						</div>
					) : plan ? (
						<div className="flex items-center justify-between px-3 py-2">
							<div>
								<span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">
									{plan.label}
								</span>
								{plan.sub && (
									<p className="mt-1.5 font-sans text-xs text-ink-dim">
										{plan.sub}
									</p>
								)}
							</div>
						</div>
					) : (
						<button
							type="button"
							role="menuitem"
							onClick={() => {
								setMenuOpen(false);
								window.location.hash = "subscribe";
							}}
							className={ITEM}
						>
							<Sparkles className="h-4 w-4 text-accent" aria-hidden />
							Upgrade to Pro
						</button>
					)}

					{/* Billing actions (customers only) */}
					{billing?.pro && (
						<a role="menuitem" href="/api/portal" className={ITEM}>
							<CreditCard className="h-4 w-4" aria-hidden />
							Manage billing
						</a>
					)}
					{billing?.hasSubscription && (
						<a
							role="menuitem"
							href="/api/checkout?plan=lifetime"
							className={ITEM}
						>
							<ArrowUpRight className="h-4 w-4 text-accent" aria-hidden />
							Upgrade to Lifetime
						</a>
					)}

					<div className="my-1 h-px bg-hairline" />

					<button
						type="button"
						role="menuitem"
						onClick={signOut}
						className={ITEM}
					>
						<LogOut className="h-4 w-4" aria-hidden />
						Sign out
					</button>

					{/* Mobile only — desktop keeps these in TopBar's own row. */}
					<div className="absolute inset-x-0 bottom-0 flex items-center justify-around gap-1 rounded-b-xl border-t border-hairline bg-panel p-1.5 lg:hidden">
						<ThemeToggle />
						<FavoritesLink />
						{billing?.pro && <SoundToggle />}
					</div>
				</div>
			)}
		</div>
	);
}
