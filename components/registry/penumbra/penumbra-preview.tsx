"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import Penumbra, { type PenumbraShardCount } from "./penumbra";

// The composition IS the template: the scene runs full-bleed, the component
// carries the left-aligned copy and the lit CTA, and this layer adds the chrome
// a real hero wears around it: a bare-text nav with a sliding underline and a
// mark top-left, built the way a consumer would build them. Flat by design:
// the type sits straight on the dark wall and the pool supplies the light.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. The mark hides below @xl so it never
// collides with the nav, and the readout also hides in portrait, where the
// copy owns the bottom edge. The bottom-right corner stays empty: the
// fullscreen stage parks its settings button there.
const NAV = ["work", "studio", "notes", "contact"] as const;

const INK = "#ecebf5";
const INK_DIM = "#a9a3bd";
const INK_FAINT = "#77718b";

export default function PenumbraPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const light = values.lightColor as string;
	const rim = values.rimColor as string;
	const shardCount = values.shardCount as PenumbraShardCount;
	const [active, setActive] = useState<(typeof NAV)[number]>("work");
	return (
		<div className="relative h-full min-h-80 w-full @container-size">
			<Penumbra
				title="Find the angle"
				subtitle="From most sides it is only noise. Turn it until the shadow says something."
				ctaLabel="Step into the light"
				word="SHADE"
				shardCount={shardCount}
				lightColor={light}
				rimColor={rim}
				shardColor={values.shardColor as string}
				wallColor={values.wallColor as string}
				shardSize={values.shardSize as number}
				scatter={values.scatter as number}
				softness={values.softness as number}
				lightIntensity={values.lightIntensity as number}
				haze={values.haze as number}
				drift={values.drift as number}
				snapBack={values.snapBack as boolean}
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
						className="relative cursor-pointer pb-[max(4px,0.5cqi)] font-display text-[max(9px,1.35cqi)] tracking-[0.25em] uppercase transition-colors duration-150 hover:text-[#ecebf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
						style={{ color: active === item ? INK : INK_DIM }}
					>
						{item}
						{active === item ? (
							<motion.span
								layoutId="__sg_pn_underline"
								aria-hidden
								className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
								style={{ backgroundColor: light, boxShadow: `0 0 8px ${rim}` }}
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
					style={{ backgroundColor: light, boxShadow: `0 0 max(8px,1cqi) ${rim}` }}
				/>
				<span
					className="font-display text-[max(8px,1.05cqi)] tracking-[0.24em] uppercase"
					style={{ color: INK_DIM }}
				>
					PENUMBRA
				</span>
			</div>

			<div className="pointer-events-none absolute bottom-[max(8px,2cqi)] left-[max(16px,4cqi)] z-10 hidden flex-col [@container(orientation:landscape)]:@xl:flex">
				<span
					className="font-display text-[max(7px,0.9cqi)] tracking-[0.26em] uppercase"
					style={{ color: INK_FAINT }}
				>
					shards
				</span>
				<span
					className="font-display text-[max(10px,1.3cqi)] tracking-widest"
					style={{ color: INK }}
				>
					{shardCount} · {(values.scatter as number).toFixed(2)}
				</span>
			</div>
		</div>
	);
}
