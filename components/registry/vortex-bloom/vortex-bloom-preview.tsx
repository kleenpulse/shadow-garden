"use client";

import type { PreviewProps } from "@/lib/registry/types";
import VortexBloom from "./vortex-bloom";

type CoreObject = "lotus" | "gem" | "flame";

export default function VortexBloomPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full min-h-80 w-full">
			<VortexBloom
				primary={values.primary as string}
				secondary={values.secondary as string}
				accent={values.accent as string}
				coreObject={values.coreObject as CoreObject}
				coreScale={values.coreScale as number}
				stemLength={values.stemLength as number}
				vortexIntensity={values.vortexIntensity as number}
				glowIntensity={values.glowIntensity as number}
				particleDensity={values.particleDensity as number}
				particleSpeed={values.particleSpeed as number}
				smokeAmount={values.smokeAmount as number}
				cameraAutoRotate={
					reducedMotion ? false : (values.cameraAutoRotate as boolean)
				}
				rotationSpeed={values.rotationSpeed as number}
				fov={values.fov as number}
				verticalOffset={values.verticalOffset as number}
				chromaticAberration={values.chromaticAberration as number}
				vignette={values.vignette as number}
				grain={values.grain as number}
				paused={paused || reducedMotion}
			/>
		</div>
	);
}
