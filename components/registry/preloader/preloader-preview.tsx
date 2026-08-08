"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Preloader from "./preloader";

export default function PreloaderPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const [replayKey, setReplayKey] = useState(0);

	// Remount on control changes so the load loop restarts with fresh values.
	const valuesKey = JSON.stringify(values);
	useEffect(() => {
		setReplayKey((k) => k + 1);
	}, [valuesKey]);

	return (
		<div className="relative h-full w-full overflow-hidden">
			{/* Revealed content — the fade-out has to uncover something. */}
			<div className="flex h-full w-full items-center justify-center">
				<span className="font-display text-2xl tracking-tight text-ink md:text-4xl">
					SHADOW GARDEN
				</span>
			</div>
			<Preloader
				key={replayKey}
				simulate
				duration={values.duration as number}
				holdDelay={values.holdDelay as number}
				fadeDuration={values.fadeDuration as number}
				ringColor={values.ringColor as string}
				overlayColor={values.overlayColor as string}
				ringSize={values.ringSize as number}
				spinSpeed={values.spinSpeed as number}
				showLabel={values.showLabel as boolean}
				reducedMotion={reducedMotion}
			/>
			{/* Above the overlay, or it's unreachable until the fade finishes. */}
			{!reducedMotion && (
				<button
					type="button"
					onClick={() => setReplayKey((k) => k + 1)}
					className="absolute bottom-3 right-3 z-50 rounded-sm border border-hairline px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.28em] text-ink-mute transition-colors hover:text-ink"
				>
					Replay
				</button>
			)}
		</div>
	);
}
