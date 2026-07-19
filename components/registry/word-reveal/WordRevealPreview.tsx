"use client";

import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
import WordReveal from "./WordReveal";

const PARAGRAPHS = [
	"Words surface from the dark as the page moves, each one pulled into focus by the scroll itself.",
	"Ease off and the reveal eases with you — the scrub ties every rise to position, not time.",
	"Scroll back and the garden reclaims them, word by word, in perfect reverse.",
];

export default function WordRevealPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const scrollerRef = useRef<HTMLDivElement>(null);

	// Auto-hiding scrollbar (same pattern as GradualBlurPreview).
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

	// Element scrollers don't recalc trigger positions when the pane resizes
	// (react-resizable-panels), so refresh explicitly.
	useEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const ro = new ResizeObserver(() => ScrollTrigger.refresh());
		ro.observe(scroller);
		return () => ro.disconnect();
	}, []);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div
				ref={scrollerRef}
				onScroll={handleScroll}
				className={cn(
					"absolute inset-0 flex flex-col overflow-y-auto px-6 md:px-10",
					"scrollbar-thin max-md:scrollbar-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:transition-colors",
					"[scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent",
					"md:hover:[scrollbar-color:var(--sg-scroll)_transparent] md:hover:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
					scrolling &&
						"md:[scrollbar-color:var(--sg-scroll)_transparent] md:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)",
				)}
			>
				<div aria-hidden className="h-[70%] shrink-0" />

				<div className="flex flex-col gap-28">
					{PARAGRAPHS.map((text) => (
						<WordReveal
							key={text}
							className="max-w-xl font-display text-xl leading-snug text-ink md:text-3xl"
							stagger={values.stagger as number}
							yOffset={values.yOffset as number}
							fromOpacity={values.fromOpacity as number}
							scrub={values.scrub as number}
							ease={values.ease as string}
							scrollerRef={scrollerRef}
							reducedMotion={reducedMotion}
						>
							{text}
						</WordReveal>
					))}
				</div>

				<div aria-hidden className="h-[75%] shrink-0" />
			</div>

			<p className="pointer-events-none absolute bottom-2 right-3 font-display text-[9px] uppercase tracking-[0.28em] text-ink-mute">
				scroll ↓
			</p>
		</div>
	);
}
