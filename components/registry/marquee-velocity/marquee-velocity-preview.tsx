"use client";

import { useRef } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import MarqueeVelocity from "./marquee-velocity";

function Row({ label }: { label: string }) {
	return (
		<span className="flex items-center font-display text-2xl tracking-widest text-ink">
			{label}
			<span className="mx-6 text-accent">◆</span>
		</span>
	);
}

export default function MarqueeVelocityPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const velocity = values.velocity as number;

	const shared = {
		damping: values.damping as number,
		stiffness: values.stiffness as number,
		numCopies: values.numCopies as number,
		scrollContainerRef: containerRef,
		reducedMotion,
	};

	return (
		<div
			ref={containerRef}
			className="h-full min-h-[320px] w-full overflow-y-auto"
		>
			{/* Tall track so scrolling inside the preview drives the velocity. */}
			<div className="h-[280%]">
				<div className="sticky top-1/2 flex -translate-y-1/2 flex-col gap-6">
					<span className="text-center font-display text-[10px] tracking-widest text-ink-mute">
						SCROLL — VELOCITY DRIVES THE DRIFT
					</span>
					<MarqueeVelocity velocity={velocity} {...shared}>
						<Row label="SHADOW GARDEN" />
					</MarqueeVelocity>
					<MarqueeVelocity velocity={-velocity} {...shared}>
						<Row label="ATOMIC" />
					</MarqueeVelocity>
				</div>
			</div>
		</div>
	);
}
