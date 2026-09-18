/* eslint-disable react-hooks/exhaustive-deps */
import { useNavState } from "../hooks/use-nav-state";
import useInView from "../hooks/util-hooks/use-in-view";
import { cn } from "@/lib/utils";
import React, { RefObject, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

const BannerRed = () => {
	const { updateBannerView } = useNavState();
	const bannerRef = useRef<HTMLDivElement>(null);
	const isBannerInView = useInView({ ref: bannerRef, once: false });

	const { scrollYProgress } = useScroll({
		offset: ["start end", "end start"],
	});

	const x = useTransform(scrollYProgress, [0, 1], ["0%", "-50%"]);

	useEffect(() => {
		if (isBannerInView) {
			updateBannerView(true);
		} else {
			updateBannerView(false);
		}
	}, [isBannerInView]);

	return (
		<div
			ref={bannerRef}
			className={cn(
				"w-full  overflow-clip  z-10 bg-[hsl(var(--primary-red))] absolute bottom-0 left-0"
			)}
		>
			<motion.div
				style={{ x }}
				className="flex items-center gap-x-2 md:gap-x-4 py-1 min-[400px]:py-2 sm:py-4  w-full "
			>
				{Array.from({ length: 100 }).map((_, index) => (
					<span
						key={index}
						className="w-fit font-bold lg:font-black sm:text-2xl md:text-3xl xl:text-[40px] text-xl flex-shrink-0"
					>
						$JIN
					</span>
				))}
			</motion.div>
		</div>
	);
};

export default BannerRed;
