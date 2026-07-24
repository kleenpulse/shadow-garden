"use client";

import type { PreviewProps } from "@/lib/registry/types";
import ShadowBloom from "./ShadowBloom";

export default function ShadowBloomPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full min-h-80 w-full">
			<ShadowBloom
				feed={values.feed as number}
				kill={values.kill as number}
				growthSpeed={values.growthSpeed as number}
				seedRadius={values.seedRadius as number}
				brushStrength={values.brushStrength as number}
				contrast={values.contrast as number}
				autoSeed={values.autoSeed as boolean}
				tint={values.tint as string}
				backgroundColor={values.backgroundColor as string}
				paused={paused || reducedMotion}
				reducedMotion={reducedMotion}
			/>
			<div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 select-none text-xs tracking-wide text-ink-mute">
				drag to seed the bloom
			</div>
		</div>
	);
}
