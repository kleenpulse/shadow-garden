"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Monolith from "./monolith";

// The composition IS the template: the scene runs full-bleed while the copy
// layer sits over it exactly as a consumer would build it. The copy itself is
// pointer-transparent so the drag belongs to the scene; the nav and CTAs are
// real buttons and keep their events.
//
// Type is container-query sized (@container + cqi): the bench preview and the
// fullscreen stage share one layout, and the type scales with the stage —
// bigger stage, bigger hero. max() floors keep the small items legible when
// the preview is narrow.
const NAV = ["overview", "specs", "archive", "contact"] as const;

export default function MonolithPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="@container relative h-full min-h-80 w-full">
			<Monolith
				slabColor={values.slabColor as string}
				rimColor={values.rimColor as string}
				sun={values.sun as boolean}
				sunColor={values.sunColor as string}
				backgroundColor={values.backgroundColor as string}
				spinSpeed={values.spinSpeed as number}
				floatAmp={values.floatAmp as number}
				scale={values.scale as number}
				zoom={values.zoom as number}
				autoSpin={values.autoSpin as boolean}
				parallax={values.parallax as boolean}
				paused={paused}
				reducedMotion={reducedMotion}
			/>

			<nav
				aria-label="Hero"
				className="pointer-events-auto absolute left-1/2 top-[max(10px,3cqi)] flex -translate-x-1/2 gap-[max(14px,3.2cqi)]"
			>
				{NAV.map((item) => (
					<button
						key={item}
						type="button"
						className="cursor-pointer font-display text-[max(9px,1.35cqi)] tracking-[0.25em] text-[#b6aecb] uppercase transition-colors duration-150 hover:text-[#f2eff8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						{item}
					</button>
				))}
			</nav>

			<div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-[max(16px,4cqi)]">
				<p className="font-display text-[max(9px,1.4cqi)] tracking-[0.32em] text-[#7d7691] uppercase">
					hero templates
				</p>
				<h2 className="mt-[0.6cqi] font-display text-[max(30px,6.8cqi)] leading-none tracking-tight text-[#f2eff8]">
					STAND<span style={{ color: values.rimColor as string }}>·</span>
					AGAINST
				</h2>
				<p className="mt-[1.4cqi] max-w-[46cqi] font-sans text-[max(12px,1.9cqi)] leading-snug text-[#b6aecb]">
					One surface, one seam of light, and a floor that runs to the edge of
					everything.
				</p>
				<div className="pointer-events-auto mt-[2cqi] flex gap-[1.6cqi]">
					<button
						type="button"
						className="cursor-pointer rounded-full px-[max(14px,2.4cqi)] py-[max(7px,1cqi)] font-display text-[max(10px,1.4cqi)] tracking-[0.18em] text-on-accent uppercase transition-transform duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
						style={{ backgroundColor: values.rimColor as string }}
					>
						begin
					</button>
					<button
						type="button"
						className="cursor-pointer rounded-full border border-[rgba(244,242,250,0.22)] px-[max(14px,2.4cqi)] py-[max(7px,1cqi)] font-display text-[max(10px,1.4cqi)] tracking-[0.18em] text-[#b6aecb] uppercase transition-[color,border-color,transform] duration-150 hover:border-[#f2eff8] hover:text-[#f2eff8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
					>
						read the docs
					</button>
				</div>
			</div>
		</div>
	);
}
