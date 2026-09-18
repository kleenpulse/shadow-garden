import { IntegrationProps } from "../types/integration";
import React, { useRef } from "react";
import BlurImage from "../miscellaneous/blur-image";
import useInView from "../hooks/util-hooks/use-in-view";
import { cn } from "@/lib/utils";

export const MetricsCard = ({
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
			className="min-w-[300px] lg:w-[310px] xl:w-[330px] min-[1440px]:min-w-[400px] max-w-[350px] relative flex flex-col justify-between gap-y-5	    xl:h-[400px] h-[325px] border border-gray-400 rounded-xl pt-3 xl:py-4 px-3 pb-2 bg-white/20 backdrop-blur-md"
		>
			<div className="flex items-center justify-center">
				<BlurImage
					src={image!}
					alt={"illustration"}
					className={cn(
						"w-full max-w-[329px]  object-contain",
						index === 2 ? "size-[180px]" : ""
					)}
					width={329}
					height={197}
				/>
			</div>
			<div className="flex flex-col gap-y-3">
				<h3 className="text-white text-xl  font-[family-name:var(--font-display)] xl:text-2xl">
					{title}
				</h3>
				<p className="text-white font-light text-xs sm:text-sm xl:text-xl ">
					{description}
				</p>
			</div>
		</div>
	);
};
