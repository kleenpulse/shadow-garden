"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Glyph pools each `charset` option draws from while a character is still
 * cryptic. Every pool has length > 1 so a re-roll can actually change.
 */
const CHARSETS: Record<string, string> = {
	symbols: "!<>-_\\/[]{}=+*^?#§%@&$~;:•¤×",
	alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	katakana:
		"アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",
	binary: "01",
	blocks: "░▒▓█▄▀▌▐▖▗▘▝▚▞■□▪▫◼◻",
};

type Mode = "decode-on-mount" | "scramble-on-hover" | "continuous-glitch";

interface ScrambleTextProps {
	/** The string to resolve to. Content, not a tunable control. */
	text?: string;
	/** How the cascade is triggered. */
	mode?: Mode;
	/** Glyph pool the still-cryptic characters roll through. */
	charset?: "symbols" | "alphanumeric" | "katakana" | "binary" | "blocks";
	/** Ceiling on total decode time, in ms — the cascade compresses to fit. */
	duration?: number;
	/** Delay between successive characters settling, in ms. */
	stagger?: number;
	/** Interval between re-rolls of the unsettled characters, in ms. */
	speed?: number;
	/** Seconds between glitch bursts in continuous-glitch mode. */
	glitchInterval?: number;
	/** Color a character flashes the moment it resolves. */
	flashColor?: string;
	/** Skip the animation entirely — render the resolved string at once. */
	reducedMotion?: boolean;
	className?: string;
}

export default function ScrambleText({
	text = "SHADOW GARDEN",
	mode = "decode-on-mount",
	charset = "symbols",
	duration = 900,
	stagger = 40,
	speed = 45,
	glitchInterval = 3,
	flashColor = "#a855f7",
	reducedMotion = false,
	className = "",
}: ScrambleTextProps) {
	const [display, setDisplay] = useState(text);
	const [flashing, setFlashing] = useState<Set<number>>(() => new Set());
	const triggerRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (reducedMotion) {
			setDisplay(text);
			setFlashing(new Set());
			triggerRef.current = null;
			return;
		}

		const pool = CHARSETS[charset] ?? CHARSETS.symbols;
		// Guard a degenerate pool so a re-roll always has somewhere to go.
		const safePool = pool.length > 1 ? pool : `${pool}·`;
		const glyphs = [...text];
		const roll = () => safePool[(Math.random() * safePool.length) | 0];

		// Burst timers (rerolls + flash clears), cleared between runs so rapid
		// hovers never stack. The scheduler below sits outside this set deliberately.
		const intervals = new Set<number>();
		const timeouts = new Set<number>();
		const clearBursts = () => {
			intervals.forEach((id) => window.clearInterval(id));
			timeouts.forEach((id) => window.clearTimeout(id));
			intervals.clear();
			timeouts.clear();
		};

		const flash = (idx: number[]) => {
			if (!idx.length) return;
			setFlashing((prev) => {
				const next = new Set(prev);
				idx.forEach((i) => next.add(i));
				return next;
			});
			idx.forEach((i) => {
				const ft = window.setTimeout(() => {
					timeouts.delete(ft);
					setFlashing((prev) => {
						const next = new Set(prev);
						next.delete(i);
						return next;
					});
				}, 280);
				timeouts.add(ft);
			});
		};

		/**
		 * Scramble `indices` and settle them one by one on staggered deadlines,
		 * leaving every other index showing its resolved character. Derives the
		 * per-char step from the count so the whole cascade fits inside `dur`.
		 */
		const runScramble = (indices: number[], dur: number) => {
			clearBursts();
			const n = indices.length;
			const natural = Math.max(0, n - 1) * stagger;
			const step = natural > dur ? dur / Math.max(1, n - 1) : stagger;
			const settleAt = new Map<number, number>();
			indices.forEach((idx, k) => settleAt.set(idx, k * step));
			const end = Math.max(0, n - 1) * step;
			const settled = new Set<number>();

			// Paint the opening frame cryptic so the word never flashes first.
			const open = glyphs.slice();
			indices.forEach((i) => {
				if (glyphs[i] !== " ") open[i] = roll();
			});
			setDisplay(open.join(""));
			setFlashing(new Set());

			const t0 = performance.now();
			const id = window.setInterval(() => {
				const t = performance.now() - t0;
				const newly: number[] = [];
				const frame = glyphs.slice();
				for (const i of indices) {
					if (glyphs[i] === " ") continue;
					if (t >= (settleAt.get(i) ?? 0)) {
						if (!settled.has(i)) {
							settled.add(i);
							newly.push(i);
						}
						frame[i] = glyphs[i];
					} else {
						frame[i] = roll();
					}
				}
				setDisplay(frame.join(""));
				flash(newly);
				if (t >= end) {
					window.clearInterval(id);
					intervals.delete(id);
					setDisplay(text);
				}
			}, Math.max(10, speed));
			intervals.add(id);
		};

		const allIndices = glyphs.map((_, i) => i);

		if (mode === "decode-on-mount") {
			triggerRef.current = null;
			runScramble(allIndices, duration);
			return clearBursts;
		}

		if (mode === "scramble-on-hover") {
			setDisplay(text);
			setFlashing(new Set());
			triggerRef.current = () => runScramble(allIndices, duration);
			return () => {
				triggerRef.current = null;
				clearBursts();
			};
		}

		triggerRef.current = null;
		setDisplay(text);
		setFlashing(new Set());
		const nonSpace = glyphs.map((_, i) => i).filter((i) => glyphs[i] !== " ");
		const burstDur = Math.min(duration, 480);
		const fire = () => {
			if (nonSpace.length === 0) return;
			const count = Math.max(1, Math.round(nonSpace.length * 0.34));
			const pool = nonSpace.slice();
			for (let i = pool.length - 1; i > 0; i--) {
				const j = (Math.random() * (i + 1)) | 0;
				[pool[i], pool[j]] = [pool[j], pool[i]];
			}
			const subset = pool.slice(0, count).sort((a, b) => a - b);
			runScramble(subset, burstDur);
		};
		const scheduler = window.setInterval(
			fire,
			Math.max(300, glitchInterval * 1000),
		);
		return () => {
			window.clearInterval(scheduler);
			clearBursts();
		};
	}, [text, mode, charset, duration, stagger, speed, glitchInterval, reducedMotion]);

	const chars = [...display];

	return (
		<span
			aria-label={text}
			onMouseEnter={
				mode === "scramble-on-hover"
					? () => triggerRef.current?.()
					: undefined
			}
			className={["inline-block whitespace-pre", className]
				.filter(Boolean)
				.join(" ")}
		>
			{chars.map((ch, i) => (
				<span
					key={i}
					aria-hidden
					style={
						flashing.has(i)
							? { color: flashColor, textShadow: `0 0 10px ${flashColor}` }
							: undefined
					}
				>
					{ch === " " ? " " : ch}
				</span>
			))}
		</span>
	);
}
