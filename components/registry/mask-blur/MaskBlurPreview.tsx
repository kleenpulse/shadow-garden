"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
import MaskBlur from "./MaskBlur";

const CARDS = [
	{
		label: "Specimen 01",
		tone: "from-accent/70 via-accent-muted/40 to-accent/60",
	},
	{
		label: "Specimen 02",
		tone: "from-accent-muted/50 via-accent/70 to-accent/50",
	},
	{
		label: "Specimen 03",
		tone: "from-accent/60 via-accent/30 to-accent-muted/60",
	},
	{
		label: "Specimen 04",
		tone: "from-accent-muted/60 via-accent/60 to-accent/40",
	},
	{
		label: "Specimen 05",
		tone: "from-accent/50 via-accent-muted/50 to-accent/70",
	},
	{
		label: "Specimen 06",
		tone: "from-accent/70 via-accent/40 to-accent-muted/50",
	},
	{
		label: "Specimen 07",
		tone: "from-accent-muted/40 via-accent/60 to-accent/60",
	},
	{
		label: "Specimen 08",
		tone: "from-accent/60 via-accent-muted/60 to-accent/50",
	},
];

export default function MaskBlurPreview({ values }: PreviewProps) {
	const position = values.position as "top" | "bottom" | "left" | "right";
	const vertical = position === "top" || position === "bottom";

	// Auto-hiding scrollbar (same pattern as the sidebar's AutoMaskVertical):
	// transparent by default, revealed on hover or while actively scrolling.
	const [scrolling, setScrolling] = useState(false);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleScroll = () => {
		setScrolling(true);
		if (hideTimer.current) clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(() => setScrolling(false), 1000);
	};

	useEffect(
		() => () => {
			if (hideTimer.current) clearTimeout(hideTimer.current);
		},
		[],
	);

	return (
		// A transformed ancestor becomes the containing block for position:fixed, so
		// a `target="page"` selection stays inside this stage instead of overlaying
		// the docs shell. The effect is static, so reducedMotion needs no handling.
		<div
			className="relative h-full w-full overflow-hidden rounded-md"
			style={{ transform: "translateZ(0)" }}
		>
			{/* Scrollable feed for the blur to act on — axis follows the chosen edge. */}
			<div
				onScroll={handleScroll}
				className={cn(
					"absolute inset-0 scrollbar-thin max-md:scrollbar-none [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:transition-colors",
					"[scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent",
					"md:hover:[scrollbar-color:var(--sg-scroll)_transparent] md:hover:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
					scrolling &&
						"md:[scrollbar-color:var(--sg-scroll)_transparent] md:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
					vertical
						? "flex flex-col gap-4 overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5"
						: "flex flex-row items-stretch gap-4 overflow-x-auto p-6 [&::-webkit-scrollbar]:h-1.5",
				)}
			>
				{CARDS.map((card) => (
					<div
						key={card.label}
						className={cn(
							"shrink-0 rounded-md border border-hairline bg-panel p-4",
							vertical ? "w-full" : "w-52",
						)}
					>
						<div
							className={cn(
								"rounded-sm bg-linear-to-r",
								card.tone,
								vertical ? "h-14" : "h-24",
							)}
						/>
						<p className="mt-3 font-display text-[10px] uppercase tracking-[0.28em] text-ink-dim">
							{card.label}
						</p>
						<p className="mt-1 text-xs text-ink-mute">
							Content dissolves as it crosses the blurred edge.
						</p>
					</div>
				))}

				<div
					aria-hidden
					className={cn("shrink-0", vertical ? "h-28" : "w-28")}
				/>
			</div>

			{/* Pinned outside the scroller so the edge never drifts with the content. */}
			<MaskBlur
				position={position}
				strength={values.strength as number}
				divCount={values.divCount as number}
				exponential={values.exponential as boolean}
				opacity={values.opacity as number}
				target={values.target as "parent" | "page"}
				tinted={values.tinted as boolean}
				height="6rem"
				curve="bezier"
			/>

			<p className="pointer-events-none absolute bottom-2 md:bottom-0 md:right-0 right-3 z-20 font-display text-[9px] md:text-base uppercase tracking-[0.28em] text-ink-mute">
				scroll {vertical ? "↓" : "→"}
			</p>
		</div>
	);
}
