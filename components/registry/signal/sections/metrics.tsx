"use client";

import { useRef } from "react";
import { METRICS_FEATURES } from "../lib/constants";
import useInView from "../hooks/util-hooks/use-in-view";
import { MetricsCard } from "../cards/metrics-card";

export const Metrics = () => {
	const howtoTitle = useRef<HTMLDivElement>(null);

	const howtoTitleInView = useInView({
		ref: howtoTitle,
		once: true,
	});

	return (
		<div className="w-full flex flex-col gap-y-10 px-3 min-[500px]:px-5 md:px-8  min-[1440px]:px-12 py-10 md:pb-20 xl:pb-44 md:pt-20 items-center relative z-20   pb-20">
			<div
				ref={howtoTitle}
				style={{
					transform: howtoTitleInView ? "none" : "translateY(100px)",
					opacity: howtoTitleInView ? 1 : 0,
					transition: "all 0.7s cubic-bezier(0.17, 0.55, 0.55, 1) 0.2s",
				}}
				id="how-it-works"
				className="flex flex-col gap-y-3 w-full justify-center items-center px-3 min-[500px]:px-5 md:px-8  min-[1440px]:px-12 overflow-y-clip  text-white max-w-[600px]"
			>
				<h2 className="font-[family-name:var(--font-display)] text-xl md:text-2xl lg:text-3xl text-center">
					Feature Scanning Metrics
				</h2>
			</div>

			<div className="overflow-x-auto w-full flex  gap-x-3 shrink-0 custom_scroll pb-3 lg:justify-center h-full overflow-y-clip lg:pb-4 pl-16 sm:pl-0">
				{METRICS_FEATURES.map((item, index) => (
					<MetricsCard key={item.id} {...item} index={index} />
				))}
			</div>
		</div>
	);
};
