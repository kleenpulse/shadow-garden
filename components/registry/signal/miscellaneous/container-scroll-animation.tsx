"use client";
import React, { useRef } from "react";
import { useScroll, useTransform, motion, MotionValue } from "motion/react";
import BlurImage from "./blur-image";
import { asset } from "../../_shared/cdn";

export const ContainerScrollAnimation = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({
		target: containerRef,
	});
	const [isMobile, setIsMobile] = React.useState(false);

	React.useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth <= 768);
		};
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => {
			window.removeEventListener("resize", checkMobile);
		};
	}, []);

	const scaleDimensions = () => {
		return isMobile ? [0.8, 1] : [1, 1];
	};

	// const rotate = useTransform(scrollYProgress, [10, 1], [20, 0]);
	const rotate = useTransform(
		scrollYProgress,
		isMobile ? [10, 1] : [0, 1],
		[10, 0]
	);
	const scale = useTransform(scrollYProgress, [0, 0.5], scaleDimensions());

	return (
		<div
			className="p-20z relative z-20 flex max-h-[683px] items-center justify-center "
			ref={containerRef}
		>
			<div
				className="heroimage__wrapper relative  w-full px-4 "
				style={{
					perspective: "1000px",
				}}
			>
				<Card rotate={rotate} scale={scale} />
			</div>
		</div>
	);
};

export const Card = ({
	rotate,
	scale,
}: {
	rotate: MotionValue<number>;
	scale: MotionValue<number>;
}) => {
	return (
		<motion.div
			style={{
				rotateX: rotate, // rotate in X-axis
				scale,
			}}
			className="hero__image scale-150z mx-auto w-full relative"
		>
			<BlurImage
				src={asset("signal/home-dashboard")}
				width={1130}
				height={483}
				quality={100}
				alt="dashboard"
				className="object-cover max-w-full"
				draggable={false}
			/>
		</motion.div>
	);
};
