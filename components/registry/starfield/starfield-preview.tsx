"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Starfield from "./starfield";

export default function StarfieldPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		// Deliberately unthemed (like .shiki-wrap): glowing stars only read on a
		// dark surface, so the stage stays graphite in both themes.
		<div className="relative h-full min-h-80 w-full bg-bench-950">
			<Starfield
				starColor={values.starColor as string}
				accentColor={values.accentColor as string}
				density={values.density as number}
				layers={values.layers as number}
				driftSpeed={values.driftSpeed as number}
				twinkle={values.twinkle as number}
				shootingStars={values.shootingStars as number}
				glow={values.glow as number}
				paused={paused || reducedMotion}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
