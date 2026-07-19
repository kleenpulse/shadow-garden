"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Constellation from "./Constellation";

export default function ConstellationPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		// Deliberately unthemed (like .shiki-wrap): glowing particles are only
		// legible on a dark surface, so the stage stays graphite in both themes.
		<div className="h-full w-full bg-bench-950">
			<Constellation
				colors={[
					values.color1 as string,
					values.color2 as string,
					values.color3 as string,
				]}
				density={values.density as number}
				speed={values.speed as number}
				connectDistance={values.connectDistance as number}
				cursorDistance={values.cursorDistance as number}
				repelForce={values.repelForce as number}
				lineOpacity={values.lineOpacity as number}
				glow={values.glow as number}
				paused={paused || reducedMotion}
			/>
		</div>
	);
}
