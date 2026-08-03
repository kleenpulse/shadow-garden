"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
import Barcode from "./Barcode";

export default function BarcodePreview({ values, reducedMotion }: PreviewProps) {
	const mode = values.mode as "autoplay" | "scrub";
	const scrollerRef = useRef<HTMLDivElement>(null);

	// Auto-hiding scrollbar (same pattern as MaskBlurPreview).
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

	const barcode = (
		<Barcode
			mode={mode}
			restOpacity={values.restOpacity as number}
			peakOpacity={values.peakOpacity as number}
			noteDuration={values.noteDuration as number}
			speed={values.speed as number}
			color={values.color as string}
			scrollerRef={mode === "scrub" ? scrollerRef : undefined}
			paused={reducedMotion}
		/>
	);

	if (mode === "autoplay" || reducedMotion) {
		return (
			<div className="flex h-full w-full items-center">
				<div className="h-[45%] max-h-64 w-full">{barcode}</div>
			</div>
		);
	}

	// Scrub mode: the piano plays as the barcode crosses the feed's viewport.
	return (
		<div className="relative h-full w-full overflow-hidden">
			<div
				ref={scrollerRef}
				onScroll={handleScroll}
				className={cn(
					"absolute inset-0 flex flex-col overflow-y-auto",
					"scrollbar-thin max-md:scrollbar-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:transition-colors",
					"[scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent",
					"md:hover:[scrollbar-color:var(--sg-scroll)_transparent] md:hover:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
					scrolling &&
						"md:[scrollbar-color:var(--sg-scroll)_transparent] md:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
				)}
			>
				<div aria-hidden className="h-[95%] shrink-0" />
				<div className="h-56 w-full shrink-0">{barcode}</div>
				<div aria-hidden className="h-[95%] shrink-0" />
			</div>

			<p className="pointer-events-none absolute bottom-2 right-3 font-display text-[9px] uppercase tracking-[0.28em] text-ink-mute">
				scroll ↓
			</p>
		</div>
	);
}
