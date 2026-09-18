"use client";
import { useLoaderState } from "../hooks/use-loader-state";
import { useEffect, useState } from "react";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { asset } from "../../_shared/cdn";

function Splash() {
	const { updateLoaded, isLoaded } = useLoaderState();
	const [percentage, setPercentage] = useState(0);

	useEffect(() => {
		document.body.style.overflow = "hidden";
		const hasLoaded = localStorage.getItem("siteLoaded") === "true";

		let intervalId: NodeJS.Timeout | undefined;
		if (percentage < 100) {
			intervalId = setInterval(
				() => {
					setPercentage((prevPercentage) => prevPercentage + 1);
				},
				hasLoaded ? 5 : 30
			);
		} else {
			clearInterval(intervalId);

			document.body.style.overflow = "auto";
			localStorage.setItem("siteLoaded", "true");
		}

		return () => clearInterval(intervalId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [percentage]);

	return (
		<div
			className={cn(
				"w-full min-h-dvh bg-black  place-items-center text-white  fixed inset-0 z-[999] grid welcome transition-transform duration-300",
				isLoaded ? "-translate-y-full pointer-events-none" : ""
			)}
		>
			<div className="w-1/2 mx-auto flex flex-col items-center gap-y-10 ">
				<div className="animate__welcome ">
					<Image
						src={asset("jinlong/gold-coins")}
						width={500}
						height={500}
						alt="gold coins"
						className="w-full max-w-[500px]"
						draggable={false}
						priority
					/>
				</div>
				<span>{percentage}%</span>

				{percentage >= 100 && (
					<Button
						variant="transparent"
						className="border border-yellow-500 text-yellow-500 lg:px-10"
						onClick={() => updateLoaded(true)}
					>
						LFG!
					</Button>
				)}
			</div>
		</div>
	);
}

export default Splash;
