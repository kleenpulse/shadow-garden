"use client";

import { useMemo } from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

interface SpecterProps {
	/** The word to render. Content, not a tunable control. */
	text?: string;
	/** Number of ghost copies stacked over the solid word. */
	ghostCount?: number;
	/** Maximum distance each ghost travels before fading out, in px. */
	drift?: number;
	/** Playback rate — cycle duration scales by 1/speed. */
	speed?: number;
	/** Direction the ghosts drift, in degrees (0 = right, 90 = down). */
	angle?: number;
	/** Delay between successive ghosts entering their cycle, in seconds. */
	stagger?: number;
	/** Blur each ghost reaches at the end of its drift, in px. */
	blur?: number;
	/** Color of the even-indexed ghost copies (hex). */
	splitColor1?: string;
	/** Color of the odd-indexed ghost copies (hex). */
	splitColor2?: string;
	/** Halt the loop: only the crisp solid word remains, ghosts at rest. */
	reducedMotion?: boolean;
	className?: string;
}

// Base cycle length in seconds at speed = 1; scaled by 1/speed at runtime.
const BASE_CYCLE = 1.6;

/**
 * plus-lighter makes overlapping ghosts add light like a real RGB split; on the
 * rare engine without it, screen is the closest additive fallback.
 */
function resolveBlend(): "plus-lighter" | "screen" {
	if (
		typeof window !== "undefined" &&
		typeof CSS !== "undefined" &&
		typeof CSS.supports === "function" &&
		CSS.supports("mix-blend-mode", "plus-lighter")
	) {
		return "plus-lighter";
	}
	return "screen";
}

export default function Specter({
	text = "SPECTER",
	ghostCount = 4,
	drift = 14,
	speed = 1,
	angle = 0,
	stagger = 0.12,
	blur = 6,
	splitColor1 = "#a855f7",
	splitColor2 = "#22d3ee",
	reducedMotion = false,
	className = "",
}: SpecterProps) {
	const blend = useMemo(resolveBlend, []);

	const count = Math.max(0, Math.round(ghostCount));
	const cycle = Math.max(0.15, BASE_CYCLE / Math.max(0.05, speed));
	const rad = (angle * Math.PI) / 180;
	const dx = Math.cos(rad) * drift;
	const dy = Math.sin(rad) * drift;

	// Declarative variants: motion reads these on each render, so a slider drag
	// re-targets the running animation without any manual rAF/ref plumbing.
	// The "still" variant carries no repeat, so selecting it cancels the loop
	// entirely rather than leaving a frozen animation spinning.
	const variants: Variants = useMemo(
		() => ({
			still: {
				opacity: 0,
				x: 0,
				y: 0,
				filter: "blur(0px)",
				transition: { duration: 0.25, ease: "easeOut" },
			},
			run: (i: number) => ({
				opacity: [1, 0],
				x: [0, dx],
				y: [0, dy],
				filter: ["blur(0px)", `blur(${blur}px)`],
				transition: {
					duration: cycle,
					delay: i * stagger,
					repeat: Infinity,
					ease: "easeOut",
				},
			}),
		}),
		[dx, dy, blur, cycle, stagger],
	);

	return (
		<span
			aria-label={text}
			className={cn(
				"relative inline-block whitespace-pre text-ink",
				className,
			)}
		>
			{/* Crisp solid base — stays sharp beneath the additive ghosts. */}
			<span aria-hidden className="relative z-0 block">
				{text}
			</span>

			{Array.from({ length: count }, (_, i) => (
				<motion.span
					key={i}
					aria-hidden
					custom={i}
					variants={variants}
					initial="still"
					animate={reducedMotion ? "still" : "run"}
					className="pointer-events-none absolute inset-0 flex items-center justify-center"
					style={{
						color: i % 2 === 0 ? splitColor1 : splitColor2,
						mixBlendMode: blend,
						willChange: "transform, opacity, filter",
					}}
				>
					{text}
				</motion.span>
			))}
		</span>
	);
}
