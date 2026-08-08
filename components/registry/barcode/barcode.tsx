"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useMemo, useRef, type RefObject } from "react";

if (typeof window !== "undefined") {
	gsap.registerPlugin(ScrollTrigger);
}

const BARCODE_CONFIG = { diagonalTilt: 22, diagonalGap: 5 };
const TIMELINE_LENGTH = 10;

/** Deterministic PRNG — strike times survive re-renders without reshuffling. */
function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface BarLine {
	x: number;
	width: number;
	type?: "diagonal";
}

interface BarcodeProps {
	/** "autoplay" loops the piano-note lighting; "scrub" ties it to scroll. */
	mode?: "autoplay" | "scrub";
	/** Opacity a bar settles at after its note. */
	restOpacity?: number;
	/** Opacity at the peak of a note strike. */
	peakOpacity?: number;
	/** Length of one note's swell and fade, in seconds. */
	noteDuration?: number;
	/** Playback rate of the autoplay loop. */
	speed?: number;
	/** Bar color. */
	color?: string;
	className?: string;
	/** Overflow element hosting the scroll (scrub mode in a pane).
	 *  Must be set before mount. */
	scrollerRef?: RefObject<HTMLElement | null>;
	/** Freeze at rest opacity (reduced motion). */
	paused?: boolean;
}

export default function Barcode({
	mode = "autoplay",
	restOpacity = 0.6,
	peakOpacity = 1,
	noteDuration = 1.6,
	speed = 1,
	color = "#a855f7",
	className,
	scrollerRef,
	paused = false,
}: BarcodeProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const topGroupRef = useRef<SVGGElement>(null);
	const botGroupRef = useRef<SVGGElement>(null);

	const topLines = useMemo(() => {
		const result: BarLine[] = [];
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
		const result: BarLine[] = [];
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

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const ctx = gsap.context(() => {
			const topBars = topGroupRef.current
				? Array.from(topGroupRef.current.children)
				: [];
			const botBars = botGroupRef.current
				? Array.from(botGroupRef.current.children)
				: [];
			if (!topBars.length || !botBars.length) return;

			const allBars = [...topBars, ...botBars];

			if (paused) {
				gsap.set(allBars, { opacity: restOpacity });
				return;
			}

			// Bars start dim and "print in" as their first note strikes.
			gsap.set(allBars, { opacity: 0.08 });

			const rand = mulberry32(1337);
			const buildPianoTl = (bars: Element[]) => {
				const tl = gsap.timeline();
				bars.forEach((bar) => {
					const strike = rand() * (TIMELINE_LENGTH * 0.85);
					const half = noteDuration / 2;
					tl.fromTo(
						bar,
						{ opacity: restOpacity },
						{ opacity: peakOpacity, duration: half, ease: "power2.out" },
						strike,
					).to(
						bar,
						{ opacity: restOpacity, duration: half, ease: "power2.in" },
						strike + half,
					);
				});
				return tl;
			};

			const master = gsap
				.timeline({ repeat: mode === "autoplay" ? -1 : 0 })
				.add(buildPianoTl(topBars))
				.add(buildPianoTl(botBars), 0);

			if (mode === "autoplay") {
				master.timeScale(speed);
			} else {
				master.pause();
				ScrollTrigger.create({
					trigger: container,
					scroller: scrollerRef?.current ?? undefined,
					start: "top 90%",
					end: "bottom 50%",
					scrub: 1.5,
					animation: master,
				});
			}
		}, container);

		return () => ctx.revert();
	}, [mode, restOpacity, peakOpacity, noteDuration, speed, scrollerRef, paused]);

	const barClass =
		"hover:opacity-100! hover:text-ink! cursor-crosshair transition-colors duration-200";

	return (
		<div
			ref={containerRef}
			className={className ?? "relative h-full w-full overflow-hidden"}
			style={{ color }}
		>
			<svg
				width="100%"
				height="100%"
				viewBox="0 0 1440 180"
				preserveAspectRatio="none"
				className="block"
			>
				<g ref={topGroupRef}>
					{topLines.map((line, i) =>
						line.type === "diagonal" ? (
							<polygon
								key={`top-${i}`}
								points={`${line.x},20 ${line.x + line.width},20 ${line.x + BARCODE_CONFIG.diagonalTilt + line.width},90 ${line.x + BARCODE_CONFIG.diagonalTilt},90`}
								fill="currentColor"
								className={barClass}
							/>
						) : (
							<rect
								key={`top-${i}`}
								x={line.x}
								y={20}
								width={line.width}
								height={70}
								fill="currentColor"
								className={barClass}
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
								className={barClass}
							/>
						) : (
							<rect
								key={`bot-${i}`}
								x={line.x}
								y={90}
								width={line.width}
								height={70}
								fill="currentColor"
								className={barClass}
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
		</div>
	);
}
