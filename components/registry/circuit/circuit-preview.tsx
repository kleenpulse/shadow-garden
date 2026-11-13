"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Circuit from "./circuit";

export default function CircuitPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full w-full">
			<Circuit
				cellSize={values.cellSize as number}
				density={values.density as number}
				pulseRate={values.pulseRate as number}
				speed={values.speed as number}
				trail={values.trail as number}
				glow={values.glow as number}
				interactive={values.interactive as boolean}
				traceColor={values.traceColor as string}
				pulseColor={values.pulseColor as string}
				boardColor={values.boardColor as string}
				paused={paused}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
