"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useAnimationFrame } from "motion/react";
import { cn } from "@/lib/utils";

interface LongShadowProps {
	/** The word to cast a long shadow from. */
	text: string;
	/** Shadow reach in px; also the layer count, capped at 48. */
	shadowLength?: number;
	/** Sun-angle sweep speed, in degrees per second. */
	sweepSpeed?: number;
	/** Starting sun angle, in degrees. */
	angleStart?: number;
	/** Angular arc the sun sweeps through when ping-ponging, in degrees. */
	angleSweep?: number;
	/** Reflect at the arc ends instead of rotating a full 360. */
	pingPong?: boolean;
	/** How much each successive layer dims, 0 (solid) .. 1 (fully faded). */
	fade?: number;
	/** Horizontal shear of the shadow direction, -0.5 .. 0.5. */
	skew?: number;
	/** Shadow color as a hex string. */
	shadowColor?: string;
	className?: string;
	/** OS reduced-motion request — settle the shadow, no sweep. */
	reducedMotion?: boolean;
	/** Manual pause — settle the shadow, no sweep. */
	paused?: boolean;
}

const MAX_LAYERS = 48;
const DEG2RAD = Math.PI / 180;

// #rgb / #rrggbb → [r,g,b]. Falls back to a neutral amethyst on garbage input.
function parseHex(hex: string): [number, number, number] {
	let h = hex.trim().replace(/^#/, "");
	if (h.length === 3) {
		h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	}
	if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
		return [168, 85, 247];
	}
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16),
	];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Build the stacked text-shadow string for a given sun angle. Each layer i
// steps one px further along (dx,dy); `skew` shears the direction horizontally;
// alpha ramps down by `fade` across the stack.
function buildShadow(
	angle: number,
	layers: number,
	fade: number,
	skew: number,
	rgb: [number, number, number],
): string {
	const a = angle * DEG2RAD;
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	const [r, g, b] = rgb;
	const parts: string[] = [];
	for (let i = 1; i <= layers; i++) {
		const x = r2((cos + skew * sin) * i);
		const y = r2(sin * i);
		const alpha = Math.max(0, 1 - fade * (i / layers));
		if (alpha <= 0) continue;
		parts.push(`${x}px ${y}px 0 rgba(${r},${g},${b},${r2(alpha)})`);
	}
	return parts.join(", ");
}

export default function LongShadow({
	text,
	shadowLength = 24,
	sweepSpeed = 20,
	angleStart = 25,
	angleSweep = 40,
	pingPong = true,
	fade = 0.85,
	skew = 0,
	shadowColor = "#a855f7",
	className,
	reducedMotion = false,
	paused = false,
}: LongShadowProps) {
	const still = paused || reducedMotion;

	const elRef = useRef<HTMLSpanElement>(null);
	const angleRef = useRef(angleStart + angleSweep / 2);
	const dirRef = useRef(1);

	// Live-tuned props, refreshed every render and read inside the frame loop so
	// a slider drag never needs the loop to be re-subscribed.
	const live = useRef({ shadowLength, sweepSpeed, angleStart, angleSweep, pingPong, fade, skew, shadowColor });
	live.current = { shadowLength, sweepSpeed, angleStart, angleSweep, pingPong, fade, skew, shadowColor };

	const write = (angle: number) => {
		const el = elRef.current;
		if (!el) return;
		const p = live.current;
		const layers = Math.max(1, Math.min(MAX_LAYERS, Math.round(p.shadowLength)));
		el.style.textShadow = buildShadow(angle, layers, p.fade, p.skew, parseHex(p.shadowColor));
	};

	// Paint one settled frame before the browser shows anything (avoids a
	// shadow-less flash on mount / theme swap).
	useLayoutEffect(() => {
		write(angleRef.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// When still (paused or reduced motion): settle the sun mid-arc and paint one
	// final frame. Re-runs on any shadow-affecting tweak so the frozen preview
	// still reflects control changes. The frame loop early-returns while still.
	useEffect(() => {
		if (!still) return;
		const settled = angleStart + angleSweep / 2;
		angleRef.current = settled;
		dirRef.current = 1;
		write(settled);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [still, angleStart, angleSweep, shadowLength, fade, skew, shadowColor]);

	useAnimationFrame((_, delta) => {
		if (still) return;
		const p = live.current;
		const step = p.sweepSpeed * (delta / 1000);
		let angle = angleRef.current;
		if (p.pingPong && p.angleSweep > 0) {
			angle += dirRef.current * step;
			const lo = p.angleStart;
			const hi = p.angleStart + p.angleSweep;
			// Reflect at the arc ends, folding any overshoot back inside.
			while (angle < lo || angle > hi) {
				if (angle > hi) {
					angle = hi - (angle - hi);
					dirRef.current = -1;
				} else if (angle < lo) {
					angle = lo + (lo - angle);
					dirRef.current = 1;
				}
			}
		} else {
			// Full continuous rotation; keep the accumulator bounded.
			angle = (angle + step) % 360;
		}
		angleRef.current = angle;
		write(angle);
	});

	return (
		<span
			ref={elRef}
			className={cn("inline-block text-ink", className)}
			style={{ willChange: "text-shadow" }}
		>
			{text}
		</span>
	);
}
