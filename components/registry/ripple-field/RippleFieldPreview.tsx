"use client";

import type { PreviewProps } from "@/lib/registry/types";
import RippleField from "./RippleField";

type Quality = "low" | "medium" | "high";

export default function RippleFieldPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full min-h-80 w-full">
			<RippleField
				waterColor={values.waterColor as string}
				deepColor={values.deepColor as string}
				quality={values.quality as Quality}
				tension={values.tension as number}
				damping={values.damping as number}
				splatForce={values.splatForce as number}
				splatRadius={values.splatRadius as number}
				refraction={values.refraction as number}
				specular={values.specular as number}
				glossiness={values.glossiness as number}
				caustics={values.caustics as number}
				autoRipple={values.autoRipple as boolean}
				grain={values.grain as number}
				paused={paused || reducedMotion}
				reducedMotion={reducedMotion}
			/>
			<div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 select-none text-xs tracking-wide text-dim">
				glide across the water
			</div>
		</div>
	);
}
