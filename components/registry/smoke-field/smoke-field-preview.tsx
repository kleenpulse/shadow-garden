"use client";

import type { PreviewProps } from "@/lib/registry/types";
import SmokeField from "./smoke-field";

type Quality = "low" | "medium" | "high";

export default function SmokeFieldPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full min-h-80 w-full">
			<SmokeField
				dyeColor={values.dyeColor as string}
				backgroundColor={values.backgroundColor as string}
				quality={values.quality as Quality}
				pressureIterations={values.pressureIterations as number}
				velocityFade={values.velocityFade as number}
				densityFade={values.densityFade as number}
				curl={values.curl as number}
				splatRadius={values.splatRadius as number}
				splatForce={values.splatForce as number}
				autoPlume={values.autoPlume as boolean}
				buoyancy={values.buoyancy as number}
				exposure={values.exposure as number}
				grain={values.grain as number}
				paused={paused || reducedMotion}
				reducedMotion={reducedMotion}
			/>
			<div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 select-none text-xs tracking-wide text-dim">
				drag to stir
			</div>
		</div>
	);
}
