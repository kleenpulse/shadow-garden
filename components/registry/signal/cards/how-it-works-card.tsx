import { IntegrationProps } from "../types/integration";
import React, { useRef } from "react";
import BlurImage from "../miscellaneous/blur-image";
import useInView from "../hooks/util-hooks/use-in-view";

export const HowItWorksCard = ({
	description,
	title,
	image,
	index,
}: IntegrationProps & { index: number }) => {
	const integrationRef = useRef<HTMLDivElement>(null);
	const integrationInView = useInView({
		ref: integrationRef,
		once: true,
	});

	return (
		<div
			ref={integrationRef}
			style={{
				transform: integrationInView ? "none" : "translateY(100px)",
				opacity: integrationInView ? 1 : 0,
				transition: `all 0.7s cubic-bezier(0.17, 0.55, 0.55, 1)  ${
					0.1 * index
				}s`,
			}}
			className="min-w-[300px] relative flex flex-col shrink-0x justify-between items-center gap-y-3	    h-[425px] border border-white/40 rounded-xl p-3 bg-white/20 backdrop-blur-md"
		>
			<div className="flex items-center justify-center  p-2 rounded-full bg-[#2B49BB] size-[179px]">
				<BlurImage
					src={image!}
					alt={"illustration"}
					className="size-full max-w-[117px]  object-contain mix-blend-plus-lighter"
					width={117}
					height={117}
				/>
			</div>
			<div className="flex flex-col gap-y-3">
				<h3 className="text-white font-bold font-[family-name:var(--font-display)] text-xl sm:text-2xl xl:text-[28px]">
					{title}
				</h3>
				<p className="text-white font-light text-xs sm:text-base xl:text-xl ">
					{description}
				</p>
			</div>
		</div>
	);
};
