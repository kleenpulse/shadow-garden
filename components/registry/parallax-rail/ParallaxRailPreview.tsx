"use client";

import { useRef } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import ParallaxRail from "./ParallaxRail";

const CARDS = [
	{ id: "I", label: "Alpha", note: "Strategy" },
	{ id: "II", label: "Beta", note: "The Author" },
	{ id: "III", label: "Gamma", note: "Logistics" },
	{ id: "IV", label: "Delta", note: "Raw Power" },
	{ id: "V", label: "Epsilon", note: "Perfection" },
	{ id: "VI", label: "Zeta", note: "Espionage" },
	{ id: "VII", label: "Eta", note: "Research" },
];

// Back plane — sparse glyphs, low contrast, drifting slowest.
function Backdrop() {
	return (
		<>
			{Array.from({ length: 14 }, (_, i) => (
				<span
					key={i}
					className="mx-14 select-none font-display text-6xl text-ink-mute/20"
				>
					◆
				</span>
			))}
		</>
	);
}

// Middle plane — a hairline ruler, the instrument-bench motif.
function Ruler() {
	return (
		<>
			{Array.from({ length: 60 }, (_, i) => (
				<span
					key={i}
					className={`mx-3 w-px shrink-0 bg-hairline ${i % 5 === 0 ? "h-5" : "h-2"}`}
				/>
			))}
		</>
	);
}

function Rail() {
	return (
		<>
			{CARDS.map((card) => (
				<article
					key={card.id}
					className="mx-2 flex h-36 w-52 shrink-0 flex-col justify-between rounded-2xl border border-hairline bg-panel p-4"
				>
					<span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">
						{card.id}
					</span>
					<div>
						<p className="font-display text-lg text-ink">{card.label}</p>
						<p className="mt-0.5 text-xs text-ink-mute">{card.note}</p>
					</div>
				</article>
			))}
		</>
	);
}

export default function ParallaxRailPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	return (
		<div
			ref={containerRef}
			// `relative` is load-bearing: useScroll walks offsetParent from the target
			// up to the container, and a static container is not in that chain — the
			// pass would be measured against the document, not this port.
			className="relative h-full max-h-100 md:max-h-160 md:min-h-150 w-full overflow-y-auto overscroll-y-contain"
		>
			{/* Tall track: the pin lasts as long as this is taller than the scroll port. */}
			<ParallaxRail
				layers={[
					<Backdrop key="back" />,
					<Ruler key="mid" />,
					<Rail key="front" />,
				]}
				planes={values.planes as number}
				travel={values.travel as number}
				depthSpread={values.depthSpread as number}
				damping={values.damping as number}
				fadeEdges={values.fadeEdges as number}
				railGap={values.railGap as number}
				scrollContainerRef={containerRef}
				reducedMotion={reducedMotion}
				className="h-[320%]"
			/>
		</div>
	);
}
