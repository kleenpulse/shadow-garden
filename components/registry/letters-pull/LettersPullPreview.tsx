"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import LettersPull from "./LettersPull";

export default function LettersPullPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const [replayKey, setReplayKey] = useState(0);

	// Remount on any control change so the one-shot entrance re-runs and the
	// tweak is actually visible. Serialized so a referentially-fresh but equal
	// values object doesn't trigger a replay.
	const valuesKey = JSON.stringify(values);
	useEffect(() => {
		setReplayKey((k) => k + 1);
	}, [valuesKey]);

	return (
		<div className="relative flex h-full w-full items-center justify-center">
			<LettersPull
				key={replayKey}
				text="SHADOW GARDEN"
				className="font-display text-2xl tracking-tight text-ink md:text-5xl"
				duration={values.duration as number}
				delay={values.delay as number}
				yValue={values.yValue as number}
				blur={values.blur as number}
				reducedMotion={reducedMotion}
			/>
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
