"use client";

import { useEffect, useState } from "react";
import { scrambleChar } from "@/lib/scramble";

interface ScrambleOpts {
	/** Skip the animation entirely — return the resolved string at once. */
	reduced?: boolean;
	/** Target total decode time in ms, held ~constant across label lengths. */
	duration?: number;
	/** ms of full-scramble lead-in before the first character settles. */
	base?: number;
	/** ms between re-rolls of the still-cryptic characters. */
	tick?: number;
}

/**
 * Decodes `target` from cryptic glyphs into the true string while `active`.
 * Characters settle left-to-right on staggered deadlines; the unsettled ones
 * re-roll every `tick` ms. Lifted from the Wordmark `decode()` burst so the
 * rail tooltip and the wordmark share one motion vocabulary.
 *
 * The per-character stagger is DERIVED from `duration`, so a long label
 * ("POWER-USER SYSTEMS") resolves in about the same wall-clock time as a short
 * one ("TOP") — the cascade just compresses. Inactive or reduced-motion →
 * returns `target` verbatim (instant, clean), so a closed tooltip and a
 * reduced-motion reader never meet the scramble. Spaces are preserved so a
 * multi-word label keeps its shape while decoding.
 */
export function useScramble(
	target: string,
	active: boolean,
	{ reduced = false, duration = 800, base = 200, tick = 50 }: ScrambleOpts = {},
): string {
	const [display, setDisplay] = useState(target);

	useEffect(() => {
		if (!active || reduced) {
			setDisplay(target);
			return;
		}

		const glyphs = [...target];
		// Fit the whole cascade inside `duration`: derive the per-char step from
		// the length so total decode time stays ~constant regardless of it.
		const step = Math.max(0, duration - base) / Math.max(1, glyphs.length - 1);
		const settleAt = glyphs.map((_, i) => base + i * step);
		const end = base + Math.max(0, glyphs.length - 1) * step;

		const frame = (t: number): string =>
			glyphs
				.map((g, i) => (g === " " ? " " : t >= settleAt[i] ? g : scrambleChar()))
				.join("");

		// Paint the opening frame fully cryptic so the popup never flashes the word.
		setDisplay(frame(0));

		const t0 = performance.now();
		const id = window.setInterval(() => {
			const t = performance.now() - t0;
			if (t >= end) {
				window.clearInterval(id);
				setDisplay(target);
			} else {
				setDisplay(frame(t));
			}
		}, tick);

		return () => window.clearInterval(id);
	}, [target, active, reduced, duration, base, tick]);

	return display;
}
