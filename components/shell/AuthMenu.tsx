"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CreditCard, LogOut, Sparkles } from "lucide-react";
import { supabaseConfiguredClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/hooks/use-auth-user";
import { usePro } from "@/hooks/use-pro";
import { useLocale } from "@/lib/i18n/provider";
import type { BillingSummary } from "@/lib/registry/billing";
import ThemeToggle from "./ThemeToggle";
import FavoritesLink from "./FavoritesLink";
import SoundToggle from "./SoundToggle";
import { useAudioAvailable } from "@/hooks/use-audio-available";
import GithubIcon from "../icons/github";

// Auth-reactive header island. Lives OUTSIDE the static shell's server render so
// the layout never reads the session (which would collapse PPR). Signed-out → a
// "Sign in" button; signed-in → an avatar that opens the account dropdown (plan
// status, manage billing, upgrade to lifetime, sign out). Renders nothing until
// Supabase is configured — and the (shell) layout only mounts it when the
// commerce stack is armed.

const ITEM =
	"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start font-sans text-sm text-ink-dim transition-colors hover:bg-raised hover:text-ink focus-visible:bg-raised focus-visible:text-ink focus-visible:outline-none";

// Pro plan badge + sub-line. Returns null for free users (they get an Upgrade item).
function planView(
	b: BillingSummary,
	t: ReturnType<typeof useTranslations<"chrome.authMenu">>,
	locale: string,
): { label: string; sub: string | null } | null {
	const formatDate = (iso: string) =>
		new Date(iso).toLocaleDateString(locale, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	if (!b.pro) return null;
	if (b.type === "lifetime")
		return { label: t("planLifetime"), sub: t("planLifetimeSub") };
	if (b.type === "subscription") {
		const date = b.currentPeriodEnd ? formatDate(b.currentPeriodEnd) : null;
		let sub = t("statusActive");
		if (b.status === "past_due") sub = t("statusPastDue");
		else if (b.cancelAtPeriodEnd && date) sub = t("statusCancels", { date });
		else if (date) sub = t("statusRenews", { date });
		return { label: t("planMembership"), sub };
	}
	return { label: t("planPro"), sub: null };
}

export default function AuthMenu() {
	const { user, ready, signIn, signOut: signOutUser } = useAuthUser();
	const [menuOpen, setMenuOpen] = useState(false);
	// The shared Pro cache — not a private snapshot. It fetches on mount (so the
	// dropdown shows the plan instantly rather than stalling on "Loading…" against
	// a cold pooler), and useAuthUser invalidates it whenever the session changes.
	const billing = usePro();
	const t = useTranslations("chrome.authMenu");
	const locale = useLocale();
	// Ask the engine, not the billing summary — otherwise this row disagrees
	// with the desktop toggle wherever the engine unlocks sound for a reason
	// billing doesn't know about (localhost).
	const soundAvailable = useAudioAvailable() === true;
	const containerRef = useRef<HTMLDivElement>(null);

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
	};

	if (!supabaseConfiguredClient) return null;

	if (!ready) {
		return (
			<div
				className="h-7 w-7 md:h-8 md:w-8 animate-pulse rounded-md bg-surface"
				aria-hidden
			/>
		);
	}

	if (!user) {
		return (
			<button
				type="button"
				onClick={signIn}
				className="flex h-7 md:h-8 items-center gap-2 rounded-md bg-surface px-3 font-sans text-xs text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
			>
				<GithubIcon className="size-4" aria-hidden />
				<span>{t("signIn")}</span>
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
	const plan = billing ? planView(billing, t, locale) : null;

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setMenuOpen((o) => !o)}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-label={t("ariaLabel")}
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
					className="absolute end-0 top-full z-50 mt-2 w-64 rounded-xl border border-hairline bg-panel p-1.5 pb-14 shadow-2xl lg:pb-1.5"
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
							{t("loading")}
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
							{t("upgradeToPro")}
						</button>
					)}

					{/* Billing actions (customers only) */}
					{billing?.pro && (
						<a role="menuitem" href="/api/portal" className={ITEM}>
							<CreditCard className="h-4 w-4" aria-hidden />
							{t("manageBilling")}
						</a>
					)}
					{billing?.hasSubscription && (
						<a
							role="menuitem"
							href="/api/checkout?plan=lifetime"
							className={ITEM}
						>
							<ArrowUpRight className="h-4 w-4 text-accent" aria-hidden />
							{t("upgradeToLifetime")}
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
						{t("signOut")}
					</button>

					{/* Mobile only — desktop keeps these in TopBar's own row. */}
					<div className="absolute inset-x-0 bottom-0 flex items-center justify-around gap-1 rounded-b-xl border-t border-hairline bg-panel p-1.5 lg:hidden">
						<ThemeToggle />
						<FavoritesLink />
						{soundAvailable && <SoundToggle />}
					</div>
				</div>
			)}
		</div>
	);
}
