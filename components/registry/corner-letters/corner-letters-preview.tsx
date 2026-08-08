"use client";

import type { PreviewProps } from "@/lib/registry/types";
import CornerLetters from "./corner-letters";

export default function CornerLettersPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	return (
		<div className="relative h-full w-full overflow-hidden">
			<div className="flex h-full w-full items-center justify-center">
				<span className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-mute">
					Corner letters — toggle visible to replay
				</span>
			</div>
			<CornerLetters
				letters="SHDW"
				visible={values.visible as boolean}
				stiffness={values.stiffness as number}
				blur={values.blur as number}
				scaleFrom={values.scaleFrom as number}
				offset={values.offset as number}
				size={values.size as number}
				color={values.color as string}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
