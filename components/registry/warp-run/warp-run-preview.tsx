"use client";

import type { PreviewProps } from "@/lib/registry/types";
import WarpRun, { type WarpDensity } from "./warp-run";

// The composition IS the template: the run goes full-bleed while the copy
// layer sits over it exactly as a consumer would build it. The copy is
// pointer-transparent so hover-steer and drag-bank still belong to the
// scene; the nav and CTAs are real buttons and keep their events.
//
// Type is container-query sized (@container + cqi): the bench preview and the
// fullscreen stage share one layout and the type scales with the stage.
// max() floors keep the small items legible when the preview is narrow.
const NAV = ["fleet", "routes", "archive", "contact"] as const;

export default function WarpRunPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="@container relative h-full min-h-80 w-full">
			<WarpRun
				density={values.density as WarpDensity}
				streakColor={values.streakColor as string}
				accentColor={values.accentColor as string}
				backgroundColor={values.backgroundColor as string}
				speed={values.speed as number}
				streakLength={values.streakLength as number}
				steer={values.steer as number}
				rollOnDrag={values.rollOnDrag as boolean}
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
					PUNCH<span style={{ color: values.accentColor as string }}>·</span>
					THROUGH
				</h2>
				<p className="mt-[1.4cqi] max-w-[46cqi] font-sans text-[max(12px,1.9cqi)] leading-snug text-[#b6aecb]">
					Every star a line, every line a second you did not spend getting
					there.
				</p>
				<div className="pointer-events-auto mt-[2cqi] flex gap-[1.6cqi]">
					<button
						type="button"
						className="cursor-pointer rounded-full px-[max(14px,2.4cqi)] py-[max(7px,1cqi)] font-display text-[max(10px,1.4cqi)] tracking-[0.18em] text-[#06060c] uppercase transition-transform duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
						style={{ backgroundColor: values.accentColor as string }}
					>
						engage
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
