"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, X } from "lucide-react";
import { PLANS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Shared upgrade modal, opened by the #subscribe URL hash (grok-style, deep-linkable).
// Any CTA sets location.hash="subscribe"; this listens and opens. Modeled on
// SuccessOverlay: fixed overlay, Lenis-proof scroll-lock, Escape/backdrop dismiss,
// gsap entrance, prefers-reduced-motion bail. The hash is client-only (never reaches
// the server), so this needs no <Suspense> under Cache Components.

function prefersReducedMotion() {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

export default function PricingModal() {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);

	// Initial read covers deep-links (/components#subscribe); hashchange covers CTAs.
	useEffect(() => {
		const sync = () => setOpen(window.location.hash === "#subscribe");
		sync();
		window.addEventListener("hashchange", sync);
		return () => window.removeEventListener("hashchange", sync);
	}, []);

	const close = useCallback(() => {
		// Drop the hash without a scroll jump or a lingering '#'.
		history.replaceState(
			null,
			"",
			window.location.pathname + window.location.search,
		);
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!open) return;
		const root = rootRef.current;
		const panel = panelRef.current;
		const backdrop = backdropRef.current;
		if (!root || !panel || !backdrop) return;

		const blockScroll = (e: Event) => {
			// Let the panel scroll its own overflow (tall content on short mobile
			// viewports); only the background page is locked. overscroll-contain on
			// the scroll region keeps that scroll from chaining out to the page.
			if (panel.contains(e.target as Node)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		window.addEventListener("wheel", blockScroll, {
			capture: true,
			passive: false,
		});
		window.addEventListener("touchmove", blockScroll, {
			capture: true,
			passive: false,
		});

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		window.addEventListener("keydown", onKey);

		let tl: gsap.core.Timeline | null = null;
		if (prefersReducedMotion()) {
			gsap.set(backdrop, { opacity: 1 });
			gsap.set(panel, { opacity: 1, y: 0, scale: 1 });
		} else {
			tl = gsap.timeline();
			tl.fromTo(
				backdrop,
				{ opacity: 0 },
				{ opacity: 1, duration: 0.25, ease: "power1.out" },
				0,
			);
			tl.fromTo(
				panel,
				{ opacity: 0, y: 16, scale: 0.97 },
				{ opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" },
				0.04,
			);
		}

		return () => {
			window.removeEventListener("wheel", blockScroll, {
				capture: true,
			} as EventListenerOptions);
			window.removeEventListener("touchmove", blockScroll, {
				capture: true,
			} as EventListenerOptions);
			window.removeEventListener("keydown", onKey);
			tl?.kill();
		};
	}, [open, close]);

	if (!open) return null;

	return (
		<div
			ref={rootRef}
			role="dialog"
			aria-modal="true"
			aria-label="Upgrade to Shadow Garden Pro"
			className="fixed inset-0 flex items-center justify-center p-3 sm:p-4"
			style={{ zIndex: 10001 }}
		>
			<div
				ref={backdropRef}
				aria-hidden
				onClick={close}
				className="absolute inset-0 touch-none bg-surface/80 backdrop-blur-sm"
			/>

			<div
				ref={panelRef}
				className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-panel shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
			>
				<button
					type="button"
					onClick={close}
					aria-label="Close"
					className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md bg-panel/70 text-ink-mute backdrop-blur-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:right-4 sm:top-4"
				>
					<X className="h-4 w-4" aria-hidden />
				</button>

				<div className="overflow-y-auto overscroll-contain p-5 sm:p-8">
					<div className="text-center">
						<p className="font-display text-[11px] uppercase tracking-[0.28em] text-accent">
							Shadow Garden Pro
						</p>
						<h2 className="mt-3 font-display text-xl tracking-tight text-ink sm:text-2xl">
							Unlock every component&apos;s source
						</h2>
						<p className="mt-2 font-sans text-sm text-ink-dim">
							Previews stay free. Pro unlocks the full, typed source for every
							component — copy, paste, ship.
						</p>
					</div>

					<div className="mt-6 grid gap-4 sm:mt-7 sm:grid-cols-2">
						{PLANS.map((plan) => (
							<div
								key={plan.slug}
								className={cn(
									"flex flex-col rounded-xl border bg-raised p-5",
									plan.highlighted
										? "border-accent ring-1 ring-accent"
										: "border-hairline",
								)}
							>
								<div className="flex items-center justify-between">
									<span className="font-display text-sm uppercase tracking-[0.14em] text-ink">
										{plan.name}
									</span>
									{plan.highlighted && (
										<span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">
											Best value
										</span>
									)}
								</div>
								<div className="mt-3 flex items-baseline gap-1">
									<span className="font-display text-3xl text-ink">
										{plan.price}
									</span>
									<span className="font-sans text-sm text-ink-mute">
										{plan.cadence}
									</span>
								</div>
								<p className="mt-1 font-sans text-xs text-ink-dim">
									{plan.tagline}
								</p>
								<ul className="mt-4 flex-1 space-y-2">
									{plan.features.map((f) => (
										<li
											key={f}
											className="flex items-start gap-2 font-sans text-xs text-ink-dim"
										>
											<Check
												className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
												aria-hidden
											/>
											{f}
										</li>
									))}
								</ul>
								<a
									href={`/api/checkout?plan=${plan.slug}`}
									className={cn(
										"mt-5 inline-flex h-11 items-center justify-center rounded-lg px-4 font-sans text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:h-10",
										plan.highlighted
											? "bg-accent text-on-accent hover:bg-accent-hover"
											: "border border-hairline bg-panel text-ink hover:border-accent-muted hover:text-accent",
									)}
								>
									{plan.cta}
								</a>
							</div>
						))}
					</div>

					<div className="mt-5 space-y-1 text-center">
						<p className="font-sans text-[11px] text-ink-dim">
							All sales are final. Pro grants instant access to copyable source,
							so payments are non-refundable once processed.
						</p>
						<p className="font-sans text-[11px] text-ink-mute">
							Secure checkout via Polar. Prices in USD.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
