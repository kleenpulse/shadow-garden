"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Chladni from "./chladni";

export default function ChladniPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full w-full">
			<Chladni
				grains={values.grains as number}
				complexity={values.complexity as number}
				dwell={values.dwell as number}
				vibration={values.vibration as number}
				bowRadius={values.bowRadius as number}
				grainSize={values.grainSize as number}
				showNodes={values.showNodes as boolean}
				grainColor={values.grainColor as string}
				plateColor={values.plateColor as string}
				paused={paused}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
