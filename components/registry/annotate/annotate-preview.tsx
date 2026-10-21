"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Annotate, { AnnotateMark, type AnnotateProps } from "./annotate";

export default function AnnotatePreview({ values, reducedMotion }: PreviewProps) {
	return (
		<div className="@container relative h-full w-full">
			<div className="flex h-full w-full items-center justify-center px-7 py-5 @[560px]:px-12">
				<Annotate
					// The marks draw once and stay, so the bench remounts on every
					// control change to draw them again with the new values.
					key={JSON.stringify(values)}
					color={values.color as string}
					highlightColor={values.highlightColor as string}
					duration={values.duration as number}
					gap={values.gap as number}
					strokeWidth={values.strokeWidth as number}
					roughness={values.roughness as number}
					padding={values.padding as number}
					seed={values.seed as number}
					trigger={values.trigger as AnnotateProps["trigger"]}
					reducedMotion={reducedMotion}
					className="w-full max-w-2xl text-[15px] leading-[1.8] text-ink @[560px]:text-xl @[560px]:leading-[1.85]"
				>
					<p>
						By day, Cid is a <AnnotateMark type="underline">background character</AnnotateMark>{" "}
						nobody notices. By night he is <AnnotateMark type="circle">Shadow</AnnotateMark>,
						master of <AnnotateMark type="box">Shadow Garden</AnnotateMark>. He{" "}
						<AnnotateMark type="strike">made up</AnnotateMark> the Cult of Diablos as an enemy. His{" "}
						<AnnotateMark type="highlight">Seven Shades think he planned it all</AnnotateMark>.
					</p>
					{/* A bracket marks off a block, so it gets a line of its own. Inline,
					    it would sit in the word gap on top of its neighbours. */}
					<p className="mt-2 @[560px]:mt-3">
						<AnnotateMark type="bracket">The cult was real.</AnnotateMark>
					</p>
				</Annotate>
			</div>
		</div>
	);
}
