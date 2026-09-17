"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import EclipseFlare, { type EclipseQuality } from "./eclipse-flare";

// The composition IS the template: the eclipse runs full-bleed, the component
// carries the centred copy and the glass CTA, and this layer adds the chrome
// a real hero wears around it — a glass nav rail and two glass readouts —
// built the way a consumer would build them. Every pane blurs the live
// canvas behind it, so the corona reads through the glass.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. max() floors keep the small items
// legible when the preview is narrow; the readouts hide below @xl so they
// never collide with the nav.
const NAV = ["totality", "path", "archive", "contact"] as const;

// Same liquid-glass recipe the component's CTA uses, on square-cornered
// panes: blur, gradient fill, hairline rim, inset top highlight, cast shadow,
// and a sheen pseudo-element along the top edge.
const GLASS =
	"overflow-hidden border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05)_48%,rgba(255,255,255,0.11))] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.08),0_14px_40px_-14px_rgba(0,0,0,0.7)] backdrop-blur-xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-x-[8%] before:top-0 before:h-[46%] before:rounded-full before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.26),rgba(255,255,255,0))] before:content-['']";

export default function EclipseFlarePreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const rim = values.rimColor as string;
	// The active pill is one motion element that moves between buttons — a
	// layoutId, so the glass slides and stretches to its new home on a spring
	// instead of blinking from one to the other.
	const [active, setActive] = useState<(typeof NAV)[number]>("totality");
	return (
		<div className="@container relative h-full min-h-80 w-full">
			<EclipseFlare
				title="After the eclipse"
				subtitle="Light finds its way around everything you put in front of it."
				ctaLabel="Step into the light"
				coreColor={values.coreColor as string}
				rimColor={rim}
				backgroundColor={values.backgroundColor as string}
				discSize={values.discSize as number}
				rayIntensity={values.rayIntensity as number}
				breathe={values.breathe as number}
				speed={values.speed as number}
				quality={values.quality as EclipseQuality}
				parallax={values.parallax as boolean}
				paused={paused}
				reducedMotion={reducedMotion}
			/>

			<nav
				aria-label="Hero"
				className={`${GLASS} pointer-events-auto absolute left-1/2 top-[max(10px,2.6cqi)] z-10 flex -translate-x-1/2 gap-[max(4px,0.6cqi)] rounded-full p-[max(3px,0.4cqi)]`}
			>
				{NAV.map((item) => (
					<button
						key={item}
						type="button"
						aria-current={active === item ? "page" : undefined}
						onClick={() => setActive(item)}
						className={`relative cursor-pointer rounded-full px-[max(10px,1.6cqi)] py-[max(5px,0.7cqi)] font-display text-[max(9px,1.2cqi)] tracking-[0.22em] uppercase transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${
							active === item ? "text-white" : "text-white/60 hover:text-white/90"
						}`}
					>
						{active === item ? (
							<motion.span
								layoutId="__sg_eclipse_pill"
								aria-hidden
								className="absolute inset-0 rounded-full bg-[linear-gradient(160deg,rgba(255,255,255,0.34),rgba(255,255,255,0.1)_55%,rgba(255,255,255,0.22))]"
								style={{
									backgroundColor: `${rim}26`,
									boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.5), inset 0 1.5px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(255,255,255,0.1), 0 0 14px -2px ${rim}66`,
								}}
								transition={
									reducedMotion
										? { duration: 0 }
										: { type: "spring", stiffness: 420, damping: 24, mass: 0.9 }
								}
							/>
						) : null}
						<span className="relative">{item}</span>
					</button>
				))}
			</nav>

			<div
				className={`${GLASS} pointer-events-none absolute left-[max(12px,2.6cqi)] top-[max(10px,2.6cqi)] z-10 hidden items-center gap-[max(8px,1cqi)] rounded-full px-[max(12px,1.5cqi)] py-[max(6px,0.8cqi)] @xl:flex`}
			>
				<span
					className="relative block size-[max(6px,0.7cqi)] rounded-full"
					style={{ backgroundColor: rim, boxShadow: `0 0 max(8px,1cqi) ${rim}` }}
				/>
				<span className="relative font-display text-[max(8px,1.05cqi)] tracking-[0.24em] text-white/80 uppercase">
					totality · 02:41
				</span>
			</div>

			<div
				className={`${GLASS} pointer-events-none absolute bottom-[max(8px,2cqi)] left-[max(12px,2.6cqi)] z-10 hidden items-baseline gap-[max(6px,0.8cqi)] rounded-full px-[max(12px,1.5cqi)] py-[max(6px,0.8cqi)] @xl:flex`}
			>
				<span className="relative font-display text-[max(8px,1.05cqi)] tracking-[0.24em] text-white/55 uppercase">
					c2
				</span>
				<span className="relative font-display text-[max(9px,1.2cqi)] tracking-[0.12em] text-white/85">
					+00:12
				</span>
			</div>
		</div>
	);
}
