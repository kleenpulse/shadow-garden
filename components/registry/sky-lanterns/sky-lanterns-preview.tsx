"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import SkyLanterns, { type SkyLanternsCount } from "./sky-lanterns";

// The composition IS the template: the scene runs full-bleed, the component
// carries the left-aligned copy and the button, and this layer adds the chrome
// a real hero wears around it: a bare-text nav with a sliding underline and a
// mark top-left, built the way a consumer would build them.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. The mark hides below @xl so it never
// collides with the nav, and the readout also hides in portrait, where the
// copy owns the bottom edge. The bottom-right corner stays empty: the
// fullscreen stage parks its settings button there.
const NAV = ["festival", "the lake", "wishes", "visit"] as const;

const INK = "#f6efe6";
const INK_DIM = "#b9b2c4";
const INK_FAINT = "#7f7a90";

export default function SkyLanternsPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const lantern = values.lanternColor as string;
	const glow = values.glowColor as string;
	const count = values.count as SkyLanternsCount;
	const [active, setActive] = useState<(typeof NAV)[number]>("festival");
	return (
		<div className="relative h-full min-h-80 w-full @container-size">
			<SkyLanterns
				title="One light for every wish"
				subtitle="The whole city lets go at once. Stand at the water and watch them climb."
				ctaLabel="Send a lantern"
				count={count}
				lanternColor={lantern}
				glowColor={glow}
				skyColor={values.skyColor as string}
				waterColor={values.waterColor as string}
				rise={values.rise as number}
				flicker={values.flicker as number}
				wind={values.wind as number}
				haze={values.haze as number}
				reflection={values.reflection as number}
				autoRotate={values.autoRotate as boolean}
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
						className="relative cursor-pointer pb-[max(4px,0.5cqi)] font-display text-[max(9px,1.35cqi)] tracking-[0.25em] whitespace-nowrap uppercase transition-colors duration-150 hover:text-[#f6efe6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
						style={{ color: active === item ? INK : INK_DIM }}
					>
						{item}
						{active === item ? (
							<motion.span
								layoutId="__sg_sl_underline"
								aria-hidden
								className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
								style={{ backgroundColor: glow, boxShadow: `0 0 8px ${lantern}` }}
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
					style={{ backgroundColor: glow, boxShadow: `0 0 max(8px,1cqi) ${lantern}` }}
				/>
				<span
					className="font-display text-[max(8px,1.05cqi)] tracking-[0.24em] uppercase"
					style={{ color: INK_DIM }}
				>
					LANTERN NIGHT
				</span>
			</div>

			<div className="pointer-events-none absolute bottom-[max(8px,2cqi)] left-[max(16px,4cqi)] z-10 hidden flex-col [@container(orientation:landscape)]:@xl:flex">
				<span
					className="font-display text-[max(7px,0.9cqi)] tracking-[0.26em] uppercase"
					style={{ color: INK_FAINT }}
				>
					in the air
				</span>
				<span
					className="font-display text-[max(10px,1.3cqi)] tracking-widest"
					style={{ color: INK }}
				>
					{count} · {(values.wind as number).toFixed(2)}
				</span>
			</div>
		</div>
	);
}
