"use client";

import type { PreviewProps } from "@/lib/registry/types";
import FlockField from "./FlockField";

export default function FlockFieldPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		// Deliberately unthemed (like .shiki-wrap): the boids glow against a dark
		// field over motion trails, so the stage stays graphite in both themes.
		<div className="relative h-full min-h-80 w-full bg-bench-950">
			<FlockField
				count={values.count as number}
				speed={values.speed as number}
				separation={values.separation as number}
				alignment={values.alignment as number}
				cohesion={values.cohesion as number}
				neighborRadius={values.neighborRadius as number}
				separationRadius={values.separationRadius as number}
				cursorMode={values.cursorMode as "attract" | "repel" | "off"}
				cursorForce={values.cursorForce as number}
				cursorRadius={values.cursorRadius as number}
				trail={values.trail as number}
				color1={values.color1 as string}
				color2={values.color2 as string}
				paused={paused || reducedMotion}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
