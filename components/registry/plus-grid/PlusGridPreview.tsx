"use client";

import type { PreviewProps } from "@/lib/registry/types";
import PlusGrid from "./PlusGrid";

export default function PlusGridPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	return (
		<div className="relative h-full w-full">
			<PlusGrid
				config={{
					gapX: values.gapX as number,
					gapY: values.gapY as number,
					fontSize: values.fontSize as number,
					baseOpacity: values.baseOpacity as number,
					waveAmplitude: values.waveAmplitude as number,
					waveFrequency: values.waveFrequency as number,
					waveDecay: values.waveDecay as number,
					color: values.color as string,
				}}
				autoPulse={reducedMotion ? false : (values.autoPulse as boolean)}
				paused={reducedMotion}
			/>
			{!reducedMotion && (
				<p className="pointer-events-none absolute bottom-2 right-3 font-display text-[9px] uppercase tracking-[0.28em] text-ink-mute">
					move — energy drives the wave
				</p>
			)}
		</div>
	);
}
