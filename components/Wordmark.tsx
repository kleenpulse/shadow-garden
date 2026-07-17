"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// The living wordmark. Its DEFAULT resting state is the solid two-tone
// "ShadowGarden" (Shadow ink, Garden accent, set tight with no space).
// Occasionally — on an idle timer or on hover/focus — it fires a typewriter
// "burst" (forward / reverse / decode / glitch) with restrained per-char
// flourish, then eases back to the two-tone default. After a hold, a gentle
// ink→accent gradient shimmer cross-fades in as a separate overlay layer, so
// the accent appears to migrate across the words.
//
// Why two layers: a solid per-char color and a bg-clip-text gradient are
// different paint models and can't CSS-tween between each other (that snap was
// the jank). Layer A carries the solid glyphs; layer B carries the gradient and
// only its opacity animates — a smooth crossfade both ways. Both layers render
// identical per-cell markup, so the gradient aligns exactly over the glyphs.
//
// Contract: accessible name is always a stable "Shadow Garden" (sr-only, with a
// space); every animated glyph is aria-hidden. Under prefers-reduced-motion it
// stays a plain static two-tone wordmark — no shimmer, no bursts, no timers.
// Initial render is that same static two-tone, so SSR == first client paint (no
// hydration mismatch; same rule as components/landing/Reveal.tsx). Space Mono is
// monospace, so glyph swaps never change width — no reflow, no spacer needed.

const TEXT = "ShadowGarden";
const SECOND = 6; // first index of "Garden"
const GLYPHS = [...TEXT];
const SCRAMBLE = "!<>-_\\/[]{}=+*^?#§%";

const INK = "var(--color-ink)";
const ACCENT = "var(--color-accent)";

type Mode = "static" | "rest" | "burst";
type Cell = { ch: string; vis: boolean; accent: boolean; dy: number };

const restCells = (): Cell[] =>
	GLYPHS.map((ch) => ({ ch, vis: true, accent: false, dy: 0 }));

export default function Wordmark({
	size = "sm",
	boldSecond = false,
	className,
}: {
	size?: "sm" | "xs";
	boldSecond?: boolean;
	className?: string;
}) {
	const reduce = useReducedMotion();
	const [mode, setMode] = useState<Mode>("static");
	const [shimmer, setShimmer] = useState(false);
	const [cells, setCells] = useState<Cell[]>(restCells);
	// The typewriter cursor rides the write head: it sits at cell `at`, on its
	// trailing edge for forward typing and leading edge for reverse. null = hidden
	// (rest, decode, glitch, reduced motion).
	const [cursor, setCursor] = useState<{ at: number; side: "left" | "right" } | null>(
		null,
	);
	const triggerRef = useRef<() => void>(() => {});

	useEffect(() => {
		if (reduce) return; // stay static: no shimmer, no bursts, no timers

		let alive = true;
		let running = false;
		let idleTimer: number | undefined;
		let holdTimer: number | undefined;
		const sleepers = new Set<number>();

		const sleep = (ms: number) =>
			new Promise<void>((res) => {
				const id = window.setTimeout(() => {
					sleepers.delete(id);
					res();
				}, ms);
				sleepers.add(id);
			});

		const patch = (i: number, p: Partial<Cell>) =>
			setCells((prev) => {
				const n = prev.slice();
				n[i] = { ...n[i], ...p };
				return n;
			});

		const reset = (make: (i: number) => Partial<Cell>) =>
			setCells((prev) => prev.map((c, i) => ({ ...c, ...make(i) })));

		const clearGlyphs = () =>
			reset((i) => ({ ch: GLYPHS[i], vis: true, accent: false, dy: 0 }));

		const rnd = (n: number) => Math.floor(Math.random() * n);
		const accentIndex = () => rnd(GLYPHS.length);

		// --- bursts -------------------------------------------------------------

		async function typeReveal(reverse: boolean) {
			const flash = accentIndex();
			const side = reverse ? "left" : "right";
			reset(() => ({ vis: false, accent: false, dy: 0 }));
			setCursor({ at: reverse ? GLYPHS.length - 1 : 0, side });
			await sleep(220);
			const order = GLYPHS.map((_, i) => i);
			if (reverse) order.reverse();
			for (const i of order) {
				if (!alive) return;
				patch(i, { ch: GLYPHS[i], vis: true, dy: 3, accent: i === flash });
				setCursor({ at: i, side });
				await sleep(34);
				patch(i, { dy: 0 });
				await sleep(78);
			}
			await sleep(620);
		}

		async function decode() {
			setCursor(null); // no single write head to follow
			reset(() => ({
				ch: SCRAMBLE[rnd(SCRAMBLE.length)],
				vis: true,
				accent: false,
				dy: 0,
			}));
			const settleAt = GLYPHS.map((_, i) => 220 + i * 100);
			const end = 220 + (GLYPHS.length - 1) * 100;
			const t0 = performance.now();
			while (alive && performance.now() - t0 < end) {
				const t = performance.now() - t0;
				setCells((prev) =>
					prev.map((c, i) =>
						t >= settleAt[i]
							? c.ch === GLYPHS[i]
								? c
								: { ...c, ch: GLYPHS[i] }
							: { ...c, ch: SCRAMBLE[rnd(SCRAMBLE.length)] },
					),
				);
				await sleep(50);
			}
			clearGlyphs();
			await sleep(620);
		}

		async function glitch() {
			setCursor(null);
			for (let f = 0; f < 9; f++) {
				if (!alive) return;
				const flash = accentIndex();
				reset((i) => ({ dy: Math.random() * 4 - 2, accent: i === flash }));
				await sleep(85);
			}
			clearGlyphs();
			await sleep(520);
		}

		const bursts = [
			() => typeReveal(false),
			() => typeReveal(true),
			decode,
			glitch,
		];

		// Ease back to the two-tone default, then breathe the shimmer in after a
		// hold — never the instant flip that read as jank.
		function toRest() {
			clearGlyphs();
			setCursor(null);
			setMode("rest");
			setShimmer(false);
			window.clearTimeout(holdTimer);
			holdTimer = window.setTimeout(() => {
				if (alive && !running && !document.hidden) setShimmer(true);
			}, 3600);
		}

		async function runBurst() {
			if (!alive || running || document.hidden) return;
			running = true;
			window.clearTimeout(holdTimer);
			setShimmer(false); // fade the gradient overlay out before the glyphs move
			setMode("burst");
			await sleep(240); // let the fast shimmer fade-out fully clear first
			try {
				await bursts[rnd(bursts.length)]();
			} finally {
				if (alive) toRest();
				running = false;
				schedule();
			}
		}

		function schedule() {
			window.clearTimeout(idleTimer);
			if (!alive || document.hidden) return;
			idleTimer = window.setTimeout(runBurst, 12000 + Math.random() * 14000);
		}

		triggerRef.current = () => void runBurst();

		const onVisibility = () => {
			if (document.hidden) {
				window.clearTimeout(idleTimer);
				window.clearTimeout(holdTimer);
			} else {
				schedule();
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		// Boot: one type-in, then settle to the two-tone default + start timers.
		void (async () => {
			running = true;
			setMode("burst");
			await typeReveal(false);
			if (alive) toRest();
			running = false;
			schedule();
		})();

		return () => {
			alive = false;
			window.clearTimeout(idleTimer);
			window.clearTimeout(holdTimer);
			sleepers.forEach((id) => window.clearTimeout(id));
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [reduce]);

	return (
		<span
			className={cn(
				"relative inline-block font-display uppercase tracking-[0.2em]",
				size === "xs" ? "text-xs" : "text-sm",
				className,
			)}
			onPointerEnter={() => triggerRef.current()}
			onFocus={() => triggerRef.current()}
		>
			<span className="sr-only">Shadow Garden</span>
			<span aria-hidden className="relative inline-block">
				{/* Layer B — gradient shimmer overlay. Same per-cell markup as layer A
				    so the gradient text aligns exactly; only its opacity animates. */}
				<span
					className="wordmark-shimmer"
					style={{
						opacity: shimmer ? 1 : 0,
						// Asymmetric: eases in slowly (gentle migration), snaps out fast so
						// it's gone before a burst starts animating layer A underneath —
						// otherwise the two "Garden"s overlap mid-transition (ghosting).
						transition: shimmer ? "opacity 1.6s ease" : "opacity 0.15s ease",
					}}
				>
					{GLYPHS.map((ch, i) => (
						<span
							key={i}
							className={cn(
								"inline-block",
								i >= SECOND && boldSecond && "font-medium",
							)}
						>
							{ch}
						</span>
					))}
				</span>
				{/* Layer A — the solid two-tone default; animates during bursts. */}
				<span className="relative inline-block">
					{cells.map((c, i) => {
						const secondWord = i >= SECOND;
						// Solid throughout: two-tone at rest, mostly ink mid-burst with
						// the flashed char in accent. color transitions smoothly, so the
						// return to two-tone eases rather than snaps.
						const color = c.accent
							? ACCENT
							: mode === "burst"
								? INK
								: secondWord
									? ACCENT
									: INK;
						return (
							<span
								key={i}
								className={cn(
									"relative inline-block",
									secondWord && boldSecond && "font-medium",
								)}
								style={{
									color,
									opacity: c.vis ? 1 : 0,
									transform: c.dy ? `translateY(${c.dy}px)` : undefined,
									transition:
										"color .9s ease, opacity .16s ease, transform .16s ease",
								}}
							>
								{c.ch}
								{cursor?.at === i && (
									// absolutely placed → rides this cell, adds no width (no reflow)
									<span
										aria-hidden
										data-on="true"
										className="wordmark-cursor"
										style={{
											position: "absolute",
											top: 0,
											[cursor.side === "right" ? "left" : "right"]: "100%",
										}}
									>
										|
									</span>
								)}
							</span>
						);
					})}
				</span>
			</span>
		</span>
	);
}
