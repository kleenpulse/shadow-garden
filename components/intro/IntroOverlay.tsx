"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

import { createDustGL, sampleWord, type DustGL } from "./dust-gl";

/**
 * Once-per-session brand intro. The pre-paint script in app/layout.tsx stamps
 * html[data-sg-intro] when this session hasn't played it yet; CSS in
 * globals.css keys visibility + scroll lock off that attribute, so the SSR'd
 * wordmark paints with zero flash and no-JS browsers never see the overlay.
 *
 * Sequence after the page load gate: a linear wind front sweeps the wordmark
 * right-to-left. The instant the front touches a char, the DOM glyph swaps
 * wholesale to its baseline-aligned GPU grain field (dust-gl.ts) — visually
 * identical, pixel-anchored — and erosion proceeds per-grain: grains hold at
 * home, then peel off staggered (crown first) and drift away as smoke, rising
 * and raking downstream through a curl field. No mask, no traveling wipe line.
 * Both sides read the same gsap clock, so they can never desync. As the final
 * char erodes, the background halves split Aventine-style to reveal the page
 * while the plume dissipates over it. No skip — the intro plays once per
 * session, in full.
 */

const WORD = "SHADOWGARDEN";
const SPLIT = 6; // "SHADOW" (ink) | "GARDEN" (accent)
const SESSION_KEY = "sg-intro-v1"; // must match the pre-paint script in app/layout.tsx
const BUDGET_PER_CHAR = 2500;
// Once-per-session — let it breathe. A decisive wind front, then a plume that
// lingers: the reclaimed sweep time is spent on the smoke, not the wipe.
const SWEEP = 1.9; // wind front travel time, right edge → left edge
const REVEAL_AT = 1.78; // halves split as the front finishes the final chars
const CANVAS_FADE_AT = 2.95; // dust gets ~1.9s of airtime over the revealed page
const FINISH_AT = 3.9;

export function IntroOverlay() {
	const [phase, setPhase] = useState<"boot" | "done">("boot");
	const rootRef = useRef<HTMLDivElement>(null);
	const topRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const wordRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const charRefs = useRef<(HTMLSpanElement | null)[]>([]);

	useEffect(() => {
		// Replay decision keyed on the attribute, not sessionStorage: Strict Mode
		// re-runs this effect after we've already written the flag below, and the
		// attribute is what survives the remount.
		if (!document.documentElement.hasAttribute("data-sg-intro")) {
			// Deferred a frame: the overlay is display:none without the attribute,
			// and a sync setState in an effect trips the React Compiler lint.
			const bail = requestAnimationFrame(() => setPhase("done"));
			return () => cancelAnimationFrame(bail);
		}

		// Mark played at activation — a reload mid-wait already showed the wordmark.
		try {
			sessionStorage.setItem(SESSION_KEY, "1");
		} catch {
			/* private mode — plays each hard load, acceptable */
		}

		const root = rootRef.current;
		const top = topRef.current;
		const bottom = bottomRef.current;
		const word = wordRef.current;
		const canvas = canvasRef.current;
		if (!root || !top || !bottom || !word || !canvas) return;

		// Pin visibility inline: unlock() removes html[data-sg-intro] mid-sequence
		// to restore scroll, which would otherwise re-trigger the CSS default
		// `#sg-intro { display: none }` and hard-cut the overlay away before the
		// halves ever animate. Inline style outlives the attribute; the real
		// removal is the unmount.
		root.style.display = "flex";

		let cancelled = false;
		let finished = false;
		let rafId = 0;
		let tl: gsap.core.Timeline | null = null;
		let dust: DustGL | null = null;
		// The wind front, tweened linearly by the timeline; starts far right so
		// nothing erodes until the sweep begins.
		const front = { x: Number.POSITIVE_INFINITY };

		const unlock = () =>
			document.documentElement.removeAttribute("data-sg-intro");

		// Input-level scroll lock: overflow:clip stops native scrolling, but
		// Lenis (SmoothScroll) accumulates wheel deltas in its virtual target
		// and applies them once scroll unlocks — the page would reveal
		// pre-scrolled. Intercept at window capture phase so no scroll handler
		// (Lenis included) ever sees input while the intro owns the screen.
		const blockScroll = (e: Event) => {
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
		const unblockScroll = () => {
			window.removeEventListener("wheel", blockScroll, { capture: true });
			window.removeEventListener("touchmove", blockScroll, { capture: true });
		};

		const finish = () => {
			if (finished) return;
			finished = true;
			unlock();
			unblockScroll();
			tl?.kill();
			cancelAnimationFrame(rafId);
			dust?.dispose();
			// Backstop for the reveal window (scrollbar drag / keyboard while the
			// halves are still sliding): the page always starts at the top.
			if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" });
			setPhase("done");
		};

		const onResize = () => dust?.setSize(window.innerWidth, window.innerHeight);
		window.addEventListener("resize", onResize);

		const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
		const onceLoaded = () =>
			document.readyState === "complete"
				? Promise.resolve()
				: new Promise<void>((r) =>
						window.addEventListener("load", () => r(), { once: true }),
					);
		const onceVisible = () =>
			new Promise<void>((r) => {
				const on = () => {
					if (document.visibilityState === "visible") {
						document.removeEventListener("visibilitychange", on);
						r();
					}
				};
				document.addEventListener("visibilitychange", on);
			});

		const run = async () => {
			// Load gate: real content + fonts (rasterization needs settled Space
			// Mono), raced against a slow-network timeout; a minimum hold prevents
			// a glitch-flash on instant loads; a hidden tab waits for focus so the
			// user actually sees the erosion.
			const minDisplay = delay(900);
			await Promise.race([
				Promise.all([onceLoaded(), document.fonts.ready]),
				delay(3500),
			]);
			await minDisplay;
			if (document.visibilityState !== "visible") await onceVisible();
			if (cancelled || finished) return;

			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				unlock();
				gsap.to(root, { opacity: 0, duration: 0.25, onComplete: finish });
				return;
			}

			// Rects captured once — scroll is locked and the overlay is fixed, so
			// they stay valid for the whole sweep (resize accepted as stale).
			const rects = charRefs.current.map((s) =>
				s ? s.getBoundingClientRect() : null,
			);
			const valid = rects.filter((r): r is DOMRect => !!r && r.width > 0);
			if (valid.length === 0) {
				unlock();
				gsap.to(root, { opacity: 0, duration: 0.25, onComplete: finish });
				return;
			}
			const wordLeft = Math.min(...valid.map((r) => r.left));
			const wordRight = Math.max(...valid.map((r) => r.right));
			const frontStart = wordRight + 40;
			const frontSpeed = (frontStart - (wordLeft - 30)) / SWEEP;

			// GPU dust; on any failure the mask-wipe erosion alone carries the
			// sequence (degraded path — no dust, same choreography).
			try {
				const grains = sampleWord(charRefs.current, BUDGET_PER_CHAR);
				if (grains.count > 0) {
					dust = createDustGL(canvas, grains, {
						width: window.innerWidth,
						height: window.innerHeight,
						dpr: Math.min(2, window.devicePixelRatio || 1),
						frontStart,
						frontSpeed,
					});
					// Warm-up draw while the wordmark still holds: absorbs pipeline
					// setup / first-draw cost so the sweep's first frames don't hitch
					// (all grains are pre-release at t=0 — nothing visible renders).
					dust.render(0);
				}
			} catch {
				dust = null;
			}

			front.x = frontStart;
			tl = gsap.timeline();
			tl.to(front, { x: wordLeft - 30, duration: SWEEP, ease: "none" }, 0);
			// Restore scroll while the halves still cover the page — the
			// scrollbar-width reflow happens invisibly under them.
			tl.call(unlock, undefined, REVEAL_AT);
			tl.to(
				top,
				{ yPercent: -100, duration: 0.9, ease: "power2.inOut" },
				REVEAL_AT,
			);
			tl.to(
				bottom,
				{ yPercent: 100, duration: 0.9, ease: "power2.inOut" },
				REVEAL_AT,
			);
			tl.to(
				canvas,
				{ opacity: 0, duration: 0.85, ease: "power1.in" },
				CANVAS_FADE_AT,
			);
			tl.call(finish, undefined, FINISH_AT);

			// One clock: the char swap reads the gsap-tweened front, the shader
			// recomputes the same linear front from tl.time() — never a frame of
			// desync between the vanishing glyph and its grain field. No mask, no
			// wipe: the instant the front touches a char it swaps wholesale to its
			// grain field (visually identical, baseline-aligned), and erosion
			// proceeds per-grain — ragged and granular, never a traveling line.
			const tick = () => {
				const t = tl?.time() ?? 0;
				for (let i = 0; i < rects.length; i++) {
					const rect = rects[i];
					const span = charRefs.current[i];
					if (!rect || !span) continue;
					if (front.x < rect.right && span.style.visibility !== "hidden") {
						span.style.visibility = "hidden";
					}
				}
				dust?.render(t);
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
		};

		void run();

		return () => {
			// Strict Mode: leave html[data-sg-intro] in place — the immediate
			// remount re-enters through it; finish() owns removal.
			cancelled = true;
			tl?.kill();
			cancelAnimationFrame(rafId);
			dust?.dispose();
			unblockScroll();
			window.removeEventListener("resize", onResize);
		};
	}, []);

	if (phase === "done") return null;

	return (
		<div
			id="sg-intro"
			ref={rootRef}
			role="img"
			aria-label="Shadow Garden"
			// display comes from globals.css (html[data-sg-intro] #sg-intro) so an
			// already-played session never paints a single frame. touch-none: iOS
			// rubber-band scrolling ignores overflow:hidden — block gestures at the
			// overlay (any tap skips anyway).
			className="fixed inset-0 touch-none flex-col items-center justify-center"
			style={{ zIndex: 10000 /* above GotoTop (z-9999) */ }}
		>
			<div
				ref={topRef}
				aria-hidden
				className="absolute inset-x-0 top-0 bg-surface"
				// +1px overlap: no subpixel seam at odd viewport heights
				style={{ height: "calc(50% + 1px)" }}
			/>
			<div
				ref={bottomRef}
				aria-hidden
				className="absolute inset-x-0 bottom-0 h-1/2 bg-surface"
			/>
			<div
				id="sg-intro-word"
				ref={wordRef}
				aria-hidden
				// font-size lives in globals.css (#sg-intro-word) — plain CSS, not
				// arbitrary utilities, so it can't be lost to a JIT/HMR wedge.
				className="relative font-sans font-bold whitespace-nowrap tracking-[0.02em]"
			>
				{[...WORD].map((ch, i) => (
					<span
						key={i}
						ref={(el) => {
							charRefs.current[i] = el;
						}}
						className={i < SPLIT ? "text-ink" : "text-accent"}
					>
						{ch}
					</span>
				))}
			</div>
			<canvas
				ref={canvasRef}
				aria-hidden
				className="pointer-events-none absolute inset-0 size-full"
			/>
		</div>
	);
}
