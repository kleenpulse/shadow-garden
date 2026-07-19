"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface BlueprintCardProps {
	accentColor?: string;
	/** Dashed outer border (technical-drawing look); solid when false. */
	dashed?: boolean;
	/** Corner node diameter in px. */
	dotSize?: number;
	/** 0–0.5 strength of the bottom gradient glow. */
	glowIntensity?: number;
	/** Draw the frame in on mount. */
	animated?: boolean;
	reducedMotion?: boolean;
	className?: string;
	children: React.ReactNode;
}

const INSET = 16; // px — rules / verticals inset; dots sit on the intersections.

// The four rule×vertical intersection points, as [left, top] CSS values.
const DOT_POSITIONS: [string, string][] = [
	[`${INSET}px`, `${INSET}px`],
	[`calc(100% - ${INSET}px)`, `${INSET}px`],
	[`${INSET}px`, `calc(100% - ${INSET}px)`],
	[`calc(100% - ${INSET}px)`, `calc(100% - ${INSET}px)`],
];

export default function BlueprintCard({
	accentColor = "#a855f7",
	dashed = true,
	dotSize = 4,
	glowIntensity = 0.15,
	animated = true,
	reducedMotion = false,
	className,
	children,
}: BlueprintCardProps) {
	const skip = !animated || reducedMotion;
	const [drawn, setDrawn] = useState(skip);

	useEffect(() => {
		if (skip) {
			setDrawn(true);
			return;
		}
		// Next frame so the undrawn state paints first and the transitions run.
		const raf = requestAnimationFrame(() => setDrawn(true));
		return () => cancelAnimationFrame(raf);
	}, [skip]);

	const line = `color-mix(in srgb, ${accentColor} 90%, transparent)`;
	const ease = "cubic-bezier(0.22, 0.61, 0.36, 1)";
	const transition = (prop: string, delay: number) =>
		skip ? undefined : `${prop} 0.6s ${ease} ${delay}s`;

	return (
		<div
			className={cn("relative backdrop-blur-md", className)}
			style={{
				border: `1px ${dashed ? "dashed" : "solid"} color-mix(in srgb, ${accentColor} 35%, transparent)`,
				background: `color-mix(in srgb, ${accentColor} 4%, transparent)`,
			}}
		>
			{/* Horizontal rules */}
			{(["top", "bottom"] as const).map((edge, i) => (
				<div
					key={edge}
					className="absolute inset-x-0 h-px"
					style={{
						[edge]: INSET,
						background: line,
						transformOrigin: i === 0 ? "left" : "right",
						transform: `scaleX(${drawn ? 1 : 0})`,
						transition: transition("transform", 0.1),
					}}
				/>
			))}
			{/* Vertical frame lines */}
			{(["left", "right"] as const).map((edge) => (
				<div
					key={edge}
					className="absolute inset-y-0 w-px"
					style={{
						[edge]: INSET,
						background: line,
						transformOrigin: "top",
						transform: `scaleY(${drawn ? 1 : 0})`,
						transition: transition("transform", 0.25),
					}}
				/>
			))}
			{/* Corner nodes — the halo masks the lines beneath each dot; it tracks
			    the themed panel var so it blends on both light and dark. */}
			{DOT_POSITIONS.map(([left, top], i) => (
				<span
					key={i}
					className="absolute rounded-full"
					style={{
						left,
						top,
						width: dotSize,
						height: dotSize,
						marginLeft: -dotSize / 2,
						marginTop: -dotSize / 2,
						background: accentColor,
						boxShadow: `0 0 0 ${Math.max(4, dotSize * 1.5)}px var(--sg-panel, #101014)`,
						transform: `scale(${drawn ? 1 : 0})`,
						transition: transition("transform", 0.45 + i * 0.08),
					}}
				/>
			))}
			{/* Bottom gradient glow */}
			<div
				className="pointer-events-none absolute inset-0 blur-sm"
				style={{
					background: `linear-gradient(to bottom, transparent 55%, color-mix(in srgb, ${accentColor} ${glowIntensity * 100}%, transparent))`,
					opacity: drawn ? 1 : 0,
					transition: transition("opacity", 0.6),
				}}
			/>
			<div
				className="relative z-10"
				style={{
					padding: INSET * 2,
					opacity: drawn ? 1 : 0,
					transition: transition("opacity", 0.4),
				}}
			>
				{children}
			</div>
		</div>
	);
}
