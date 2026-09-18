"use client";

import { useRef } from "react";
import { HOWITWORKS } from "../lib/constants";
import useInView from "../hooks/util-hooks/use-in-view";
import { HowItWorksCard } from "../cards/how-it-works-card";

export const HowItWorks = () => {
	const howtoTitle = useRef<HTMLDivElement>(null);
	const integrationRef = useRef<HTMLDivElement>(null);
	const integrationInView = useInView({
		ref: integrationRef,
		once: true,
	});
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
				<h2 className="font-[family-name:var(--font-display)] text-xl md:text-3xl lg:text-4xl text-center">
					How It Works
				</h2>
			</div>

			<div className="overflow-x-auto w-full flex  gap-3 shrink-0 custom_scroll pb-3 min-[1900px]:justify-center h-full overflow-y-clip lg:pb-4 pl-16 sm:pl-0 lg:grid lg:grid-cols-3">
				{HOWITWORKS.map((item, index) => (
					<HowItWorksCard key={item.id} {...item} index={index} />
				))}
				<div
					ref={integrationRef}
					style={{
						transform: integrationInView ? "none" : "translateY(100px)",
						opacity: integrationInView ? 1 : 0,
						transition: `all 0.7s cubic-bezier(0.17, 0.55, 0.55, 1)  ${
							0.1 * 5
						}s`,
					}}
					className="min-w-[300px] relative hidden lg:flex flex-col shrink-0x justify-between items-center gap-y-3	    h-[425px] border border-gray-100/20 rounded-xl p-3 bg-white/10 backdrop-blur-md"
				/>
			</div>
		</div>
	);
};
