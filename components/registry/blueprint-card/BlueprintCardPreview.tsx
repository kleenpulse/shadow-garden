"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import BlueprintCard from "./BlueprintCard";

export default function BlueprintCardPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const [replayKey, setReplayKey] = useState(0);

	// Remount on control changes so the one-shot draw-in re-runs.
	const valuesKey = JSON.stringify(values);
	useEffect(() => {
		setReplayKey((k) => k + 1);
	}, [valuesKey]);

	const animated = values.animated as boolean;

	return (
		<div className="relative flex h-full w-full items-center justify-center p-6">
			<BlueprintCard
				key={replayKey}
				accentColor={values.accentColor as string}
				dashed={values.dashed as boolean}
				dotSize={values.dotSize as number}
				glowIntensity={values.glowIntensity as number}
				animated={animated}
				reducedMotion={reducedMotion}
				className="w-full max-w-sm"
			>
				<div className="flex items-baseline justify-between font-display text-[10px] uppercase tracking-[0.28em] text-ink-mute">
					<span>BP-07</span>
					<span>Rev. C</span>
				</div>
				<h3 className="mt-3 font-display text-xl tracking-tight text-ink">
					BLUEPRINT CARD
				</h3>
				<p className="mt-2 text-sm leading-relaxed text-ink-dim">
					A technical-drawing frame — dashed envelope, accent rules, and corner
					nodes pinned to their intersections.
				</p>
				<div className="mt-4 flex items-center justify-between font-display text-[10px] uppercase tracking-[0.28em] text-ink-mute">
					<span>Scale 1:1</span>
					<span>Sheet 07/34</span>
				</div>
			</BlueprintCard>
			{animated && !reducedMotion && (
				<button
					type="button"
					onClick={() => setReplayKey((k) => k + 1)}
					className="absolute bottom-3 right-3 rounded-sm border border-hairline px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.28em] text-ink-mute transition-colors hover:text-ink"
				>
					Replay
				</button>
			)}
		</div>
	);
}
