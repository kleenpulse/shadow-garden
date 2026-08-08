"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Sigil from "./sigil";

export default function SigilPreview({ values, reducedMotion }: PreviewProps) {
	const [replayKey, setReplayKey] = useState(0);

	// Remount on control changes so the draw-in animation re-runs.
	const valuesKey = JSON.stringify(values);
	useEffect(() => {
		setReplayKey((k) => k + 1);
	}, [valuesKey]);

	const replayOnLeave = values.replayOnLeave as boolean;

	return (
		<div className="relative flex h-full w-full flex-col items-center justify-center gap-5 p-6">
			<Sigil
				key={replayKey}
				duration={values.duration as number}
				delay={values.delay as number}
				strokeWidth={values.strokeWidth as number}
				glow={values.glow as number}
				replayOnLeave={replayOnLeave}
				easing={
					values.easing as "ease-out" | "linear" | "ease-in-out" | "dramatic"
				}
				strokeColor={values.strokeColor as string}
				reducedMotion={reducedMotion}
				className="size-56"
			/>
			<p className="font-display text-[10px] uppercase tracking-[0.25em] text-ink-mute">
				{replayOnLeave ? "Redraws on re-entry" : "Draws once"}
			</p>
			{!reducedMotion && (
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
