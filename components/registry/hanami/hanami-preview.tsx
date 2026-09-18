"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import Hanami, { type HanamiWeather } from "./hanami";

// The composition IS the template: the garden runs full-bleed, the component
// carries the left-aligned copy and the petal CTA, and this layer adds the
// chrome a real hero wears around it — a bare-text nav with a sliding petal
// underline and two bare readouts — built the way a consumer would build
// them. Flat by design: no panes, no blur; dark plum type sits straight on
// the pale scene and the blossom supplies all the color.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. max() floors keep the small items
// legible when the preview is narrow; the readouts hide below @xl so they
// never collide with the nav, and the lower one also hides in portrait,
// where the copy owns the bottom edge.
const NAV = ["garden", "seasons", "teahouse", "visit"] as const;

const INK = "#3f3242";
const INK_DIM = "#3f324299";
const PETAL = "#c76d97";

export default function HanamiPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	// The underline is one motion element that moves between items — a
	// layoutId, so it slides to the clicked item on a spring instead of
	// blinking from one to the other.
	const [active, setActive] = useState<(typeof NAV)[number]>("garden");
	return (
		<div className="relative h-full min-h-80 w-full @container-size">
			<Hanami
				title="Beneath the bloom"
				subtitle="Five days a year the whole garden turns pink. Be under it."
				ctaLabel="Plan your visit"
				windSpeed={values.windSpeed as number}
				fallingPetals={values.fallingPetals as number}
				bloomAmount={values.bloomAmount as number}
				weather={values.weather as HanamiWeather}
				windDirection={values.windDirection as number}
				cameraDistance={values.cameraDistance as number}
				parallax={values.parallax as boolean}
				parallaxStrength={values.parallaxStrength as number}
				paused={paused}
				reducedMotion={reducedMotion}
			/>

			<nav
				aria-label="Hero"
				className="pointer-events-auto absolute left-1/2 top-[max(10px,3cqi)] z-10 flex -translate-x-1/2 gap-[max(14px,3.2cqi)]"
			>
				{NAV.map((item) => (
					<button
						key={item}
						type="button"
						aria-current={active === item ? "page" : undefined}
						onClick={() => setActive(item)}
						className="relative cursor-pointer pb-[max(4px,0.5cqi)] font-display text-[max(9px,1.35cqi)] tracking-[0.25em] uppercase transition-colors duration-150 hover:text-[#3f3242] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f3242]/60"
						style={{ color: active === item ? INK : INK_DIM }}
					>
						{item}
						{active === item ? (
							<motion.span
								layoutId="__sg_hn_underline"
								aria-hidden
								className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
								style={{
									backgroundImage: `linear-gradient(90deg, transparent, ${PETAL}, transparent)`,
								}}
								transition={
									reducedMotion
										? { duration: 0 }
										: { type: "spring", stiffness: 420, damping: 30, mass: 0.8 }
								}
							/>
						) : null}
					</button>
				))}
			</nav>

			{/* Short on purpose — a longer line runs into the centered nav on
          stage-sized containers before the @xl gate would hide it. */}
			<div className="pointer-events-none absolute left-[max(16px,4cqi)] top-[max(10px,3cqi)] z-10 hidden items-center gap-[max(8px,1cqi)] @xl:flex">
				<span
					className="block size-[max(6px,0.7cqi)] rounded-full"
					style={{
						backgroundColor: PETAL,
						boxShadow: `0 0 max(8px,1cqi) ${PETAL}`,
					}}
				/>
				<span
					className="font-display text-[max(12px,1.5cqi)] font-bold tracking-[0.24em] uppercase"
					style={{ color: INK_DIM }}
				>
					HANAMI
				</span>
			</div>

			{/* Bottom-left, not bottom-right — the fullscreen stage parks its
          settings button in the bottom-right corner. */}
			<div className="pointer-events-none absolute bottom-[max(8px,2cqi)] left-[max(16px,4cqi)] z-10 hidden flex-col [@container(orientation:landscape)]:@xl:flex">
				<span
					className="font-display text-[max(7px,0.9cqi)] tracking-[0.26em] uppercase"
					style={{ color: INK_DIM }}
				>
					petal fall
				</span>
				<span
					className="font-display text-[max(10px,1.3cqi)] tracking-widest"
					style={{ color: INK }}
				>
					5 cm · s⁻¹
				</span>
			</div>

			{/* The garden's small print: two short body-font paragraphs hugging the
          lower-right corner, the way studio sites sign their footers.
          Landscape-only — in portrait the copy owns the bottom edge. Pale
          ink, not plum: this corner sits on the turf, the one dark region of
          the scene — the left wash gradient never reaches it. */}
			<div className="pointer-events-none absolute bottom-1 right-1 z-10 hidden max-w-[max(220px,25cqi)] flex-col gap-[max(8px,1cqi)] text-left text-[max(11px,1.1cqi)] leading-snug [@container(orientation:landscape)]:@xl:flex text-white/90 mix-blend-luminosity">
				<p>
					The garden keeps its own hours — gates open at first light and close
					when the lanterns are lit.
				</p>
				<p>
					Full bloom is weather-led and never promised. Five days, most years.
					Check the forecast before you travel.
				</p>
			</div>
		</div>
	);
}
