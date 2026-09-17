"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import LiquidChrome, {
	type LiquidChromeBlobCount,
	type LiquidChromeQuality,
} from "./liquid-chrome";

// The composition IS the template: the studio runs full-bleed, the component
// carries the left-aligned copy and the chrome CTA, and this layer adds the
// chrome a real hero wears around it — a bare-text nav with a sliding metal
// underline and two bare readouts — built the way a consumer would build
// them. Flat by design: no panes, no blur; the type sits straight on the
// scene and the metal supplies all the depth.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. max() floors keep the small items
// legible when the preview is narrow; the readouts hide below @xl so they
// never collide with the nav, and the lower one also hides in portrait,
// where the copy owns the bottom edge.
const NAV = ["alloy", "forms", "studio", "contact"] as const;

export default function LiquidChromePreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const chrome = values.chromeColor as string;
	const accent = values.accentColor as string;
	// The underline is one motion element that moves between items — a
	// layoutId, so it slides to the clicked item on a spring instead of
	// blinking from one to the other.
	const [active, setActive] = useState<(typeof NAV)[number]>("alloy");
	return (
		<div className="relative h-full min-h-80 w-full @container-size">
			<LiquidChrome
				title="Form in flux"
				subtitle="Never the same shape twice, always the same substance."
				ctaLabel="Watch it move"
				chromeColor={chrome}
				accentColor={accent}
				backgroundColor={values.backgroundColor as string}
				blobCount={values.blobCount as LiquidChromeBlobCount}
				morphSpeed={values.morphSpeed as number}
				smoothness={values.smoothness as number}
				gloss={values.gloss as number}
				quality={values.quality as LiquidChromeQuality}
				parallax={values.parallax as boolean}
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
						className={`relative cursor-pointer pb-[max(4px,0.5cqi)] font-display text-[max(9px,1.35cqi)] tracking-[0.25em] uppercase transition-colors duration-150 hover:text-[#f2eff8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${
							active === item ? "text-[#f2eff8]" : "text-[#b6aecb]"
						}`}
					>
						{item}
						{active === item ? (
							<motion.span
								layoutId="__sg_lc_underline"
								aria-hidden
								className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
								style={{
									backgroundImage: `linear-gradient(90deg, transparent, ${chrome}, transparent)`,
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

			<div className="pointer-events-none absolute left-[max(16px,4cqi)] top-[max(10px,3cqi)] z-10 hidden items-center gap-[max(8px,1cqi)] @xl:flex">
				<span
					className="block size-[max(6px,0.7cqi)] rounded-full"
					style={{ backgroundColor: accent, boxShadow: `0 0 max(8px,1cqi) ${accent}` }}
				/>
				<span className="font-display text-[max(8px,1.05cqi)] tracking-[0.24em] text-[#b6aecb] uppercase">
					specimen · hg-80
				</span>
			</div>

			<div className="pointer-events-none absolute bottom-[max(8px,2cqi)] left-[max(16px,4cqi)] z-10 hidden flex-col [@container(orientation:landscape)]:@xl:flex">
				<span className="font-display text-[max(7px,0.9cqi)] tracking-[0.26em] text-[#7d7691] uppercase">
					melting point
				</span>
				<span className="font-display text-[max(10px,1.3cqi)] tracking-widest text-[#f2eff8]">
					−38.83 °c
				</span>
			</div>
		</div>
	);
}
