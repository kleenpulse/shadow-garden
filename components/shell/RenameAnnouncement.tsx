"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { GrowPanel } from "@/components/shell/grow-dialog";
import {
	RENAME_ATTR,
	RENAME_KEY,
	RENAME_POSTER,
	RENAME_VIDEO,
} from "@/lib/announcement";

// Centered, muted video telling returning visitors the site was renamed. The
// who-sees-it verdict is made pre-paint (lib/announcement.ts); this component
// only waits for a polite moment to open and records that it did.

const POLL_MS = 400;
// Let the page land after the intro before a second overlay takes the screen.
const SETTLE_MS = 800;
// Above the landing header (z-99) and GotoTop (z-9999); below PricingModal.
const LAYER = 10000;

function alreadySeen(): boolean {
	try {
		return localStorage.getItem(RENAME_KEY) === "seen";
	} catch {
		// Storage gone mid-session: fail closed rather than risk showing it on
		// every load with no way to remember the dismissal.
		return true;
	}
}

function markSeen() {
	try {
		localStorage.setItem(RENAME_KEY, "seen");
	} catch {
		/* private mode / quota — shown once this load, acceptable */
	}
}

function isBusy(): boolean {
	const root = document.documentElement;
	// The intro drops its attribute mid-sequence to restore scroll; the overlay
	// element itself only unmounts once the intro is truly finished.
	if (root.hasAttribute("data-sg-intro") || document.getElementById("sg-intro"))
		return true;
	if (document.hidden || document.fullscreenElement) return true;
	if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
	// Never steal focus from someone typing (search, feedback, command menu).
	const el = document.activeElement;
	if (
		el instanceof HTMLElement &&
		(el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
	)
		return true;
	return false;
}

function saveData(): boolean {
	const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
	return Boolean(nav.connection?.saveData);
}

export default function RenameAnnouncement() {
	const t = useTranslations("chrome.renameAnnouncement");
	const reduce = Boolean(useReducedMotion());
	const [open, setOpen] = useState(false);
	const [failed, setFailed] = useState(false);
	const [lite, setLite] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const descId = useId();

	useEffect(() => {
		const root = document.documentElement;
		const verdict = root.getAttribute(RENAME_ATTR);
		if (verdict === null) return;
		const forced = verdict === "force";

		let idleSince = 0;
		const tick = () => {
			if (isBusy()) {
				idleSince = 0;
				return;
			}
			if (!idleSince) idleSince = performance.now();
			if (performance.now() - idleSince < SETTLE_MS) return;
			window.clearInterval(timer);
			root.removeAttribute(RENAME_ATTR);
			// Re-checked at the last moment: another tab may have shown it while
			// this one waited behind its intro.
			if (!forced && alreadySeen()) return;
			// Marked on open, not on close — a reload mid-video must not replay it.
			markSeen();
			setLite(saveData());
			setOpen(true);
		};
		const timer = window.setInterval(tick, POLL_MS);
		return () => window.clearInterval(timer);
	}, []);

	const close = useCallback(() => setOpen(false), []);

	// Autoplay once the panel is up. Muted inline playback is allowed without a
	// gesture everywhere; if a browser still refuses, the poster and native
	// controls are already on screen, so the rejection is simply ignored.
	useEffect(() => {
		if (!open || failed || reduce || lite) return;
		const video = videoRef.current;
		if (!video) return;
		video.muted = true;
		video.defaultMuted = true;
		video.play().catch(() => {});
	}, [open, failed, reduce, lite]);

	// GrowPanel's body overflow lock doesn't reach Lenis on the landing page,
	// which scrolls from wheel/touch input directly. Swallow that input outside
	// the panel (same approach as PricingModal and the intro).
	useEffect(() => {
		if (!open) return;
		const block = (e: Event) => {
			if (panelRef.current?.contains(e.target as Node)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		const opts = { capture: true, passive: false } as const;
		window.addEventListener("wheel", block, opts);
		window.addEventListener("touchmove", block, opts);
		return () => {
			window.removeEventListener("wheel", block, opts);
			window.removeEventListener("touchmove", block, opts);
		};
	}, [open]);

	return (
		<GrowPanel
			open={open}
			onOpenChange={setOpen}
			layer={LAYER}
			reducedMotion={reduce}
			aria-label={t("title")}
			aria-describedby={descId}
			className="w-full max-w-3xl border border-hairline bg-panel shadow-2xl"
		>
			<div
				ref={panelRef}
				className="flex max-h-[calc(100svh-2rem)] flex-col overflow-y-auto overscroll-contain"
			>
				{/* The footage is dark in both themes, so this frame stays black and
				    the close control on it stays light — like .shiki-wrap. */}
				<div className="relative bg-black">
					<button
						type="button"
						onClick={close}
						aria-label={t("close")}
						className="absolute end-3 top-3 z-10 grid size-8 place-items-center rounded-md bg-black/55 text-white/75 backdrop-blur-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					>
						<X className="size-4" aria-hidden />
					</button>
					{failed ? (
						// eslint-disable-next-line @next/next/no-img-element -- static poster fallback, no optimisation wanted
						<img
							src={RENAME_POSTER}
							alt={t("videoLabel")}
							className="block aspect-video w-full object-contain"
						/>
					) : (
						<video
							ref={videoRef}
							src={RENAME_VIDEO}
							poster={RENAME_POSTER}
							muted
							playsInline
							controls
							// In the dialog's Tab cycle (GrowPanel's selector skips media).
							tabIndex={0}
							preload={lite ? "none" : "auto"}
							controlsList="nodownload noplaybackrate noremoteplayback"
							disablePictureInPicture
							aria-label={t("videoLabel")}
							onError={() => setFailed(true)}
							className="block aspect-video w-full object-contain"
						/>
					)}
				</div>
				<div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
					<div className="min-w-0">
						<p className="font-display text-[11px] uppercase tracking-[0.28em] text-accent">
							{t("eyebrow")}
						</p>
						<h2 className="mt-2 font-display text-base tracking-tight text-ink sm:text-lg">
							{t("title")}
						</h2>
						<p id={descId} className="mt-1 font-sans text-sm text-ink-dim">
							{t("body")}
						</p>
					</div>
					<button
						type="button"
						onClick={close}
						className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-accent px-5 font-sans text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
					>
						{t("cta")}
					</button>
				</div>
			</div>
		</GrowPanel>
	);
}
