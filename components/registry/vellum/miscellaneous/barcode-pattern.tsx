"use client";

import { useDimensions } from "../hooks/use-dimensions";
import { useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { useIsDark } from "../hooks/use-is-dark";

gsap.registerPlugin(ScrollTrigger);

const BARCODE_CONFIG = { diagonalTilt: 22, diagonalGap: 5 };

export default function BarcodePattern() {
	const { width } = useDimensions();
	const isMobile = width < 768;
	const [isDark] = useIsDark();

	const containerRef = useRef<HTMLDivElement>(null);
	const topGroupRef = useRef<SVGGElement>(null);
	const botGroupRef = useRef<SVGGElement>(null);

	const topLines = useMemo(() => {
		const result: { x: number; width: number; type?: "diagonal" }[] = [];
		let x = 20;
		[4, 1.5, 3, 2, 1.5].forEach((w) => {
			result.push({ x, width: w });
			x += w + 10;
		});
		x += BARCODE_CONFIG.diagonalGap;
		result.push({ x, width: 3, type: "diagonal" });
		x += 3 + BARCODE_CONFIG.diagonalTilt + BARCODE_CONFIG.diagonalGap + 12;
		const pattern = [2, 1.5, 3, 1.5, 1.5, 4, 1.5, 3, 1.5];
		let p = 0;
		while (x < 1440) {
			const w = pattern[p++ % pattern.length];
			result.push({ x, width: w });
			x += w + 10;
		}
		return result;
	}, []);

	const bottomLines = useMemo(() => {
		const result: { x: number; width: number; type?: "diagonal" }[] = [];
		let x = 20;
		const pattern = [1.5, 3, 1.5, 1.5, 2, 1.5, 3, 1.5, 2, 1.5, 3, 1.5, 1.5, 2];
		let p = 0;
		while (x < 1320) {
			const w = pattern[p++ % pattern.length];
			result.push({ x, width: w });
			x += w + 10;
		}
		x += BARCODE_CONFIG.diagonalGap;
		result.push({ x, width: 3, type: "diagonal" });
		x += 3 + BARCODE_CONFIG.diagonalTilt + BARCODE_CONFIG.diagonalGap + 10;
		[3, 1.5, 4, 1.5, 3].forEach((w) => {
			result.push({ x, width: w });
			x += w + 10;
		});
		while (x < 1440) {
			result.push({ x, width: 1.5 });
			x += 11.5;
		}
		return result;
	}, []);

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			const topBars = topGroupRef.current
				? Array.from(topGroupRef.current.children)
				: [];
			const botBars = botGroupRef.current
				? Array.from(botGroupRef.current.children)
				: [];

			if (!topBars.length || !botBars.length) return;

			gsap.set([...topBars, ...botBars], { opacity: 0.08 });

			const TIMELINE_LENGTH = 10;
			const NOTE_DURATION = 1.6;
			const PEAK_OPACITY = 1;
			const REST_OPACITY = isDark ? 0.7 : 0.5;

			const buildPianoTl = (bars: Element[]) => {
				const tl = gsap.timeline();

				bars.forEach((bar) => {
					const strike = Math.random() * (TIMELINE_LENGTH * 0.85);
					const half = NOTE_DURATION / 2;

					tl.fromTo(
						bar,
						{ opacity: REST_OPACITY },
						{ opacity: PEAK_OPACITY, duration: half, ease: "power2.out" },
						strike,
					).to(
						bar,
						{ opacity: REST_OPACITY, duration: half, ease: "power2.in" },
						strike + half,
					);
				});

				return tl;
			};

			ScrollTrigger.create({
				trigger: containerRef.current,
				start: "top 90%",
				end: "bottom 50%",
				scrub: 1.5,
				animation: gsap
					.timeline()
					.add(buildPianoTl(topBars))
					.add(buildPianoTl(botBars), 0),
			});
		},
		{ scope: containerRef, dependencies: [isMobile, isDark, still] },
	);

	return (
		<div
			ref={containerRef}
			className="relative w-full overflow-hidden h-50 md:h-95"
		>
			<svg
				width="100%"
				height="100%"
				viewBox={isMobile ? "0 0 770 180" : "0 0 1440 180"}
				preserveAspectRatio="none"
				className="text-[var(--foreground)] block"
			>
				<g ref={topGroupRef}>
					{topLines.map((line, i) =>
						line.type === "diagonal" ? (
							<polygon
								key={`top-${i}`}
								points={`${line.x},20 ${line.x + line.width},20 ${line.x + BARCODE_CONFIG.diagonalTilt + line.width},90 ${line.x + BARCODE_CONFIG.diagonalTilt},90`}
								fill="currentColor"
								className="hover:opacity-100! hover:text-neutral-500! dark:hover:text-white! cursor-crosshair transition-colors duration-200"
							/>
						) : (
							<rect
								key={`top-${i}`}
								x={line.x}
								y={20}
								width={line.width}
								height={70}
								fill="currentColor"
								className="hover:opacity-100! hover:text-neutral-500! dark:hover:text-white! cursor-crosshair transition-colors duration-200"
							/>
						),
					)}
				</g>

				<g ref={botGroupRef}>
					{bottomLines.map((line, i) =>
						line.type === "diagonal" ? (
							<polygon
								key={`bot-${i}`}
								points={`${line.x + BARCODE_CONFIG.diagonalTilt},90 ${line.x + BARCODE_CONFIG.diagonalTilt + line.width},90 ${line.x + line.width},160 ${line.x},160`}
								fill="currentColor"
								className="hover:opacity-100! hover:text-neutral-500! dark:hover:text-white! cursor-crosshair transition-colors duration-200"
							/>
						) : (
							<rect
								key={`bot-${i}`}
								x={line.x}
								y={90}
								width={line.width}
								height={70}
								fill="currentColor"
								className="hover:opacity-100! hover:text-neutral-500! dark:hover:text-white! cursor-crosshair transition-colors duration-200"
							/>
						),
					)}
				</g>

				<line
					x1="0"
					y1="90"
					x2="1440"
					y2="90"
					stroke="currentColor"
					strokeWidth="0.5"
					opacity="0.1"
				/>
			</svg>

			<div className="group absolute right-12 md:right-50 lg:right-80 top-5.5 md:top-10.5 size-19.5 md:size-37 bg-black dark:bg-white flex items-center justify-center flex-col gap-y-3 md:gap-y-4 text-sm md:text-3xl cursor-pointer transition-all duration-500 hover:scale-[1.08] hover:shadow-[0_10px_40px_rgba(0,0,0,0.3)] dark:hover:shadow-[0_10px_40px_rgba(255,255,255,0.3)]">
				<span className="tracking-[0.35em] w-full ml-1 leading-none md:leading-tight text-center md:ml-2 text-[var(--card)] transition-transform duration-300 group-hover:-translate-y-0.5">
					AVEN
				</span>
				<span className="w-full pl-1 tracking-[0.4em] leading-none md:leading-tight text-center text-[var(--card)] transition-transform duration-300 group-hover:translate-y-0.5">
					TINE
				</span>
			</div>
		</div>
	);
}
