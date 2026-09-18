import { IntegrationProps } from "../types/integration";
import React, { useRef } from "react";
import BlurImage from "../miscellaneous/blur-image";
import useInView from "../hooks/util-hooks/use-in-view";

export const IntegrationCard = ({
	description,
	image,
	index,
	hasLink,
	link,
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
			className="w-full max-w-[280px] xl:max-w-[300px] relative flex flex-col justify-between gap-y-3	 font-[family-name:var(--font-body)]  text-xs sm:text-sm md:text-base h-[150px] sm:h-[200px] lg:h-[232px] border border-gray-400 rounded-xl p-3 bg-white/20 backdrop-blur-3xl"
		>
			<div className="flex items-center justify-center">
				<BlurImage
					src={image!}
					alt={"illustration"}
					className="w-full max-w-[329px]  object-contain"
					width={266}
					height={132}
					quality={100}
				/>
			</div>
			<p className="text-white font-light">
				{description}
				{hasLink && (
					<a
						href={link}
						target="_blank"
						className="text-[var(--accent-yellow)] ml-2 bloc text-sm hover:underline hover:opacity-80 hover:underline-offset-2"
					>
						Click here
					</a>
				)}
			</p>
		</div>
	);
};
