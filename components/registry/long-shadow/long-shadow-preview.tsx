"use client";

import type { PreviewProps } from "@/lib/registry/types";
import LongShadow from "./long-shadow";

export default function LongShadowPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="flex h-full w-full items-center justify-center overflow-hidden px-6">
			<LongShadow
				text="SHADOW"
				className="font-display text-6xl font-bold tracking-tight md:text-8xl"
				shadowLength={values.shadowLength as number}
				sweepSpeed={values.sweepSpeed as number}
				angleStart={values.angleStart as number}
				angleSweep={values.angleSweep as number}
				pingPong={values.pingPong as boolean}
				fade={values.fade as number}
				skew={values.skew as number}
				shadowColor={values.shadowColor as string}
				reducedMotion={reducedMotion}
				paused={paused}
			/>
		</div>
	);
}
