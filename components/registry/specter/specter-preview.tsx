"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Specter from "./specter";

const DEMO_TEXT = "SPECTER";

export default function SpecterPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="flex h-full min-h-80 w-full items-center justify-center px-6">
			<Specter
				text={DEMO_TEXT}
				ghostCount={values.ghostCount as number}
				drift={values.drift as number}
				speed={values.speed as number}
				angle={values.angle as number}
				stagger={values.stagger as number}
				blur={values.blur as number}
				splitColor1={values.splitColor1 as string}
				splitColor2={values.splitColor2 as string}
				reducedMotion={paused || reducedMotion}
				className="text-center font-display text-5xl font-medium uppercase tracking-[0.18em] text-ink sm:text-6xl md:text-7xl"
			/>
		</div>
	);
}
