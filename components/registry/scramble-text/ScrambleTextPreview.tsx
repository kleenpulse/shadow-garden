"use client";

import type { PreviewProps } from "@/lib/registry/types";
import ScrambleText from "./ScrambleText";

const DEMO_TEXT = "SHADOW GARDEN";

export default function ScrambleTextPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="flex h-full min-h-80 w-full items-center justify-center px-6">
			<ScrambleText
				text={DEMO_TEXT}
				mode={
					values.mode as
						| "decode-on-mount"
						| "scramble-on-hover"
						| "continuous-glitch"
				}
				charset={
					values.charset as
						| "symbols"
						| "alphanumeric"
						| "katakana"
						| "binary"
						| "blocks"
				}
				duration={values.duration as number}
				stagger={values.stagger as number}
				speed={values.speed as number}
				glitchInterval={values.glitchInterval as number}
				flashColor={values.flashColor as string}
				reducedMotion={paused || reducedMotion}
				className="text-center font-mono text-3xl font-medium uppercase tracking-[0.2em] text-ink sm:text-4xl md:text-5xl"
			/>
		</div>
	);
}
