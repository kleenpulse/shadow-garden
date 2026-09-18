/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";

function LineColumn({
	className,
	boxes,
}: {
	className?: string;
	boxes: number[];
}) {
	return (
		<div
			className={`relative flex gap-x-1 md:gap-x-1.5 h-full w-fit ${className || ""}`}
		>
			<div className="h-full w-px dark:bg-[#9292922E] bg-[#CECECEE8]" />
			<div className="h-full w-px dark:bg-[#9292922E] bg-[#CECECEE8]" />
			{boxes.map((pos, i) => (
				<motion.div
					key={i}
					initial={{ opacity: 0, scale: 0.8 }}
					whileInView={{ opacity: 1, scale: 1 }}
					// once: false — each dot re-animates as you scroll into its section
					viewport={{ once: false, margin: "-10% 0px -10% 0px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
					className="absolute size-1 md:size-1.5 bg-[#363636] dark:bg-white left-1/2 -translate-x-1/2"
					style={{ top: `${pos}px` }}
				/>
			))}
		</div>
	);
}

export default function SiteLines() {
	const [mounted, setMounted] = useState(false);
	const [boxPositions, setBoxPositions] = useState<number[][]>([
		[],
		[],
		[],
		[],
	]);
	const containerRef = useRef<HTMLDivElement>(null);

	const lastWidthRef = useRef<number>(0);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const buildPositions = () => {
			const vh = document.documentElement.clientHeight;
			const totalHeight = document.documentElement.scrollHeight;
			const sections = Math.max(1, Math.ceil(totalHeight / vh));

			const positions: number[][] = [[], [], [], []];
			for (let s = 0; s < sections; s++) {
				const count = Math.floor(Math.random() * 2) + 2;
				const cols = [0, 1, 2, 3]
					.sort(() => Math.random() - 0.5)
					.slice(0, count);

				for (const col of cols) {
					const offset = 20 + Math.random() * (vh - 40);
					positions[col].push(s * vh + offset);
				}
			}
			return positions;
		};

		// Initial paint
		setBoxPositions(buildPositions());
		setMounted(true);
		lastWidthRef.current = container.offsetWidth;

		let timeout: NodeJS.Timeout;

		const observer = new ResizeObserver((entries) => {
			const newWidth = entries[0]?.contentRect.width ?? container.offsetWidth;

			if (Math.abs(newWidth - lastWidthRef.current) < 1) return;

			lastWidthRef.current = newWidth;
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				setBoxPositions(buildPositions());
			}, 200);
		});

		observer.observe(container);

		return () => {
			clearTimeout(timeout);
			observer.disconnect();
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 overflow-hidden pointer-events-none  flex w-full h-full justify-between z-0 px-2 md:px-4"
		>
			{Array.from({ length: 4 }).map((_, i) => (
				<LineColumn key={i} boxes={mounted ? boxPositions[i] : []} />
			))}
		</div>
	);
}
