"use client";

import type { PreviewProps } from "@/lib/registry/types";
import BlackHole from "./black-hole";

type DebugMode = "off" | "steps" | "disk" | "min-r" | "escape-dir" | "redshift";

export default function BlackHolePreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full min-h-80 w-full">
			<BlackHole
				steps={values.steps as number}
				diskInner={values.diskInner as number}
				diskOuter={values.diskOuter as number}
				diskBrightness={values.diskBrightness as number}
				dopplerMax={values.dopplerMax as number}
				starBrightness={values.starBrightness as number}
				skyFloor={values.skyFloor as number}
				rotationSpeed={values.rotationSpeed as number}
				fov={values.fov as number}
				bloomStrength={values.bloomStrength as number}
				bloomRadius={values.bloomRadius as number}
				vignette={values.vignette as number}
				grain={values.grain as number}
				chromaticAberration={values.chromaticAberration as number}
				autoOrbit={reducedMotion ? false : (values.autoOrbit as boolean)}
				debug={values.debug as DebugMode}
				tint={values.tint as string}
				ringColor={values.ringColor as string}
				paused={paused || reducedMotion}
			/>
		</div>
	);
}
