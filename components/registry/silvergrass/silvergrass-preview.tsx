"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import Silvergrass, { type SilvergrassDensity } from "./silvergrass";

// The composition IS the template: the field runs full-bleed, the component
// carries the left-aligned copy and the silver pill, and this layer adds the
// chrome a real hero wears around it: a bare-text nav with a sliding silver
// underline and two bare readouts that follow the controls, built the way a
// consumer would build them. Flat by design: no panes, no blur; the type sits
// straight on the night and the moonlit grass supplies the light.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. max() floors keep the small items
// legible when the preview is narrow; the readouts hide below @xl so they
// never collide with the nav, and the lower one also hides in portrait, where
// the copy owns the bottom edge. The bottom-right corner stays empty: the
// fullscreen stage parks its settings button there.
const NAV = ["meadow", "moonrise", "archive", "visit"] as const;

const INK = "#ecebf5";
const INK_DIM = "#a9a3bd";
const INK_FAINT = "#77718b";

export default function SilvergrassPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const tip = values.tipColor as string;
	const glow = values.glowColor as string;
	const windSpeed = values.windSpeed as number;
	// The underline is one motion element that moves between items: a
	// layoutId, so it slides to the clicked item on a spring instead of
	// blinking from one to the other.
	const [active, setActive] = useState<(typeof NAV)[number]>("meadow");
	return (
		<div className="relative h-full min-h-80 w-full @container-size">
			<Silvergrass
				title="Part the field"
				subtitle="Every blade bends to the wind. Move, and they bend to you."
				ctaLabel="Walk in"
				density={values.density as SilvergrassDensity}
				tipColor={tip}
				bladeColor={values.bladeColor as string}
				glowColor={glow}
				skyColor={values.skyColor as string}
				windSpeed={windSpeed}
				windStrength={values.windStrength as number}
				bladeHeight={values.bladeHeight as number}
				partRadius={values.partRadius as number}
				gust={values.gust as boolean}
				moon={values.moon as boolean}
				motes={values.motes as boolean}
				zoom={values.zoom as number}
				autoSpin={values.autoSpin as boolean}
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
						className="relative cursor-pointer pb-[max(4px,0.5cqi)] font-display text-[max(9px,1.35cqi)] tracking-[0.25em] uppercase transition-colors duration-150 hover:text-[#ecebf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
						style={{ color: active === item ? INK : INK_DIM }}
					>
						{item}
						{active === item ? (
							<motion.span
								layoutId="__sg_sv_underline"
								aria-hidden
								className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
								style={{
									backgroundColor: tip,
									boxShadow: `0 0 8px ${glow}`,
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

			{/* Short on purpose: a longer line runs into the centred nav on
          stage-sized containers before the @xl gate would hide it. */}
			<div className="pointer-events-none absolute left-[max(16px,4cqi)] top-[max(10px,3cqi)] z-10 hidden items-center gap-[max(8px,1cqi)] @xl:flex">
				<span
					className="block size-[max(6px,0.7cqi)] rounded-full"
					style={{ backgroundColor: tip, boxShadow: `0 0 max(8px,1cqi) ${tip}` }}
				/>
				<span
					className="font-display text-[max(8px,1.05cqi)] tracking-[0.24em] uppercase"
					style={{ color: INK_DIM }}
				>
					SILVERGRASS
				</span>
			</div>

			<div className="pointer-events-none absolute bottom-[max(8px,2cqi)] left-[max(16px,4cqi)] z-10 hidden flex-col [@container(orientation:landscape)]:@xl:flex">
				<span
					className="font-display text-[max(7px,0.9cqi)] tracking-[0.26em] uppercase"
					style={{ color: INK_FAINT }}
				>
					wind
				</span>
				<span
					className="font-display text-[max(10px,1.3cqi)] tracking-widest"
					style={{ color: INK }}
				>
					{(windSpeed * 3.2).toFixed(1)} m · s⁻¹
				</span>
			</div>
		</div>
	);
}
