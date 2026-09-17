"use client";

import type { PreviewProps } from "@/lib/registry/types";
import DepthStage from "./depth-stage";

// The demo children ARE the template: seven layers from a perspective floor
// at the back to counter-moving chips in front of the stage plane, each
// tagged with data-depth so the stage knows how deep to sink it. Copy/paste
// these shapes as a starting point for a real hero.
//
// Everything is styled with bench tokens rather than hex: unlike the WebGL
// heroes this stage has no colour of its own, so it has to survive light
// mode. Type is container-query sized (@container + cqi) so the bench
// preview and the fullscreen stage share one layout.
const NAV = ["orbit", "telemetry", "archive", "contact"] as const;
// Far-field stars as [left%, top%, px, opacity] — fixed, so the field is
// the same on every render and every reload.
const STARS: ReadonlyArray<readonly [number, number, number, number]> = [
	[6, 12, 2, 0.5], [14, 41, 3, 0.7], [21, 22, 2, 0.4], [27, 63, 4, 0.8],
	[33, 9, 2, 0.5], [38, 47, 3, 0.6], [44, 78, 2, 0.4], [49, 18, 5, 0.9],
	[55, 58, 2, 0.5], [61, 31, 3, 0.7], [67, 84, 2, 0.4], [72, 14, 4, 0.8],
	[78, 52, 2, 0.5], [84, 27, 3, 0.6], [89, 71, 2, 0.4], [93, 44, 4, 0.7],
	[11, 88, 3, 0.6], [58, 92, 3, 0.6], [80, 92, 2, 0.4], [30, 35, 2, 0.4],
];
const BARS = [0.35, 0.55, 0.42, 0.7, 0.62, 0.88, 0.5, 0.76, 0.58, 0.92, 0.66, 0.8];

export default function DepthStagePreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const accent = values.accentColor as string;
	const spin = reducedMotion ? "none" : undefined;
	return (
		<div className="@container relative h-full min-h-80 w-full">
			<style>{`
				@keyframes __sg_depth_orbit { from { transform: rotateX(72deg) rotateZ(0deg); } to { transform: rotateX(72deg) rotateZ(360deg); } }
				@keyframes __sg_depth_orbit_r { from { transform: rotateX(72deg) rotateZ(360deg); } to { transform: rotateX(72deg) rotateZ(0deg); } }
			`}</style>
			<DepthStage
				accentColor={accent}
				depth={values.depth as number}
				tiltMax={values.tiltMax as number}
				entrance={values.entrance as boolean}
				float={values.float as boolean}
				spotlight={values.spotlight as boolean}
				depthOfField={values.depthOfField as boolean}
				reducedMotion={reducedMotion}
			>
				{/* depth 1.3 — the far field: a scatter of stars and two soft nebula
				    washes, oversized so the z push never reveals an edge. Being the
				    deepest layer it also takes the most lens blur, which is what
				    turns dots into distance. */}
				<div data-depth="1.3" className="absolute -inset-[30%]">
					<div
						className="absolute inset-0"
						style={{
							backgroundImage: `radial-gradient(40% 32% at 22% 30%, ${accent}22 0%, transparent 100%), radial-gradient(34% 28% at 74% 68%, ${accent}1a 0%, transparent 100%)`,
						}}
					/>
					{STARS.map((star, i) => (
						<span
							key={i}
							className="absolute block rounded-full"
							style={{
								left: `${star[0]}%`,
								top: `${star[1]}%`,
								width: `${star[2]}px`,
								height: `${star[2]}px`,
								backgroundColor: accent,
								opacity: star[3],
								boxShadow: star[2] > 3 ? `0 0 ${star[2] * 2}px ${accent}` : undefined,
							}}
						/>
					))}
				</div>

				{/* depth 1 — ghost type: an outline word the size of the stage */}
				<div data-depth="1" className="absolute inset-0 flex items-center justify-center">
					<p
						aria-hidden
						className="font-display text-[26cqi] leading-none tracking-tighter text-transparent opacity-40"
						style={{ WebkitTextStroke: `1px ${accent}` }}
					>
						DEPTH
					</p>
				</div>

				{/* depth 0.65 — the orbital system: three rings laid flat and spun
				    in CSS, a lit core in the middle */}
				<div data-depth="0.65" className="absolute inset-0 flex items-center justify-center">
					<div className="relative" style={{ width: "48cqi", height: "48cqi" }}>
						<div
							className="absolute top-1/2 left-1/2 rounded-full"
							style={{
								width: "9cqi",
								height: "9cqi",
								marginLeft: "-4.5cqi",
								marginTop: "-4.5cqi",
								background: `radial-gradient(circle at 35% 30%, #ffffffcc 0%, ${accent} 30%, ${accent}00 72%)`,
								boxShadow: `0 0 6cqi ${accent}99, 0 0 14cqi ${accent}40`,
							}}
						/>
						{[
							{ size: 24, dur: 18, rev: false, moon: true },
							{ size: 36, dur: 29, rev: true, moon: false },
							{ size: 48, dur: 44, rev: false, moon: true },
						].map((ring) => (
							<div
								key={ring.size}
								className="absolute top-1/2 left-1/2 rounded-full border"
								style={{
									width: `${ring.size}cqi`,
									height: `${ring.size}cqi`,
									marginLeft: `-${ring.size / 2}cqi`,
									marginTop: `-${ring.size / 2}cqi`,
									borderColor: `${accent}66`,
									animation:
										spin ??
										`${ring.rev ? "__sg_depth_orbit_r" : "__sg_depth_orbit"} ${ring.dur}s linear infinite`,
									transform: "rotateX(72deg)",
								}}
							>
								{ring.moon ? (
									<span
										className="absolute top-0 left-1/2 block rounded-full"
										style={{
											width: "1.1cqi",
											height: "1.1cqi",
											marginLeft: "-0.55cqi",
											marginTop: "-0.55cqi",
											backgroundColor: accent,
											boxShadow: `0 0 1.6cqi ${accent}`,
										}}
									/>
								) : null}
							</div>
						))}
					</div>
				</div>

				{/* depth 0.45 — a telemetry card, mid-stack */}
				<div data-depth="0.45" className="absolute top-[max(44px,9cqi)] right-[max(16px,4cqi)]">
					<div className="w-[max(140px,22cqi)] rounded-lg border border-hairline bg-panel/90 p-[max(10px,1.6cqi)] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
						<div className="flex items-baseline justify-between">
							<p className="font-display text-[max(8px,1cqi)] tracking-[0.28em] text-accent uppercase">
								telemetry
							</p>
							<p className="font-display text-[max(8px,1cqi)] tracking-[0.18em] text-ink-mute uppercase">
								live
							</p>
						</div>
						<div className="mt-[1.4cqi] flex h-[max(28px,5cqi)] items-end gap-[0.5cqi]">
							{BARS.map((h, i) => (
								<span
									key={i}
									className="block flex-1 rounded-t-[1px]"
									style={{
										height: `${h * 100}%`,
										backgroundColor: accent,
										opacity: 0.35 + h * 0.6,
									}}
								/>
							))}
						</div>
						<div className="mt-[1.4cqi] grid grid-cols-2 gap-[1cqi]">
							<div>
								<p className="font-display text-[max(7px,0.9cqi)] tracking-[0.22em] text-ink-mute uppercase">
									altitude
								</p>
								<p className="font-display text-[max(11px,1.7cqi)] text-ink">4.2k</p>
							</div>
							<div>
								<p className="font-display text-[max(7px,0.9cqi)] tracking-[0.22em] text-ink-mute uppercase">
									drift
								</p>
								<p className="font-display text-[max(11px,1.7cqi)] text-ink">0.03</p>
							</div>
						</div>
					</div>
				</div>

				{/* depth 0.15 — the nav, nearly on the stage plane */}
				<div data-depth="0.15" className="absolute inset-x-0 top-[max(10px,3cqi)] flex justify-center">
					<nav aria-label="Hero" className="pointer-events-auto flex gap-[max(14px,3.2cqi)]">
						{NAV.map((item) => (
							<button
								key={item}
								type="button"
								className="cursor-pointer font-display text-[max(9px,1.35cqi)] tracking-[0.25em] text-ink-dim uppercase transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
							>
								{item}
							</button>
						))}
					</nav>
				</div>

				{/* depth 0.2 — the headline stack */}
				<div data-depth="0.2" className="absolute inset-0 flex flex-col justify-end p-[max(16px,4cqi)]">
					<p className="font-display text-[max(9px,1.4cqi)] tracking-[0.32em] text-ink-mute uppercase">
						hero templates
					</p>
					<h2 className="mt-[0.6cqi] font-display text-[max(30px,6.8cqi)] leading-none tracking-tight text-ink">
						FALL<span style={{ color: accent }}>·</span>FORWARD
					</h2>
					<p className="mt-[1.4cqi] max-w-[46cqi] font-sans text-[max(12px,1.9cqi)] leading-snug text-ink-dim">
						Seven layers, one pointer, no canvas. Lean in and the whole stack
						leans back.
					</p>
					<div className="pointer-events-auto mt-[2cqi] flex gap-[1.6cqi]">
						<button
							type="button"
							className="cursor-pointer rounded-full px-[max(14px,2.4cqi)] py-[max(7px,1cqi)] font-display text-[max(10px,1.4cqi)] tracking-[0.18em] text-on-accent uppercase transition-transform duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
							style={{ backgroundColor: accent }}
						>
							launch
						</button>
						<button
							type="button"
							className="cursor-pointer rounded-full border border-hairline px-[max(14px,2.4cqi)] py-[max(7px,1cqi)] font-display text-[max(10px,1.4cqi)] tracking-[0.18em] text-ink-dim uppercase transition-[color,border-color,transform] duration-150 hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
						>
							read the docs
						</button>
					</div>
				</div>

				{/* depth -0.4 — chips in FRONT of the stage plane: they counter-move,
				    which is what sells the plane being where it is */}
				<div data-depth="-0.4" className="pointer-events-none absolute inset-0">
					{[
						{ label: "zero canvas", left: "9%", top: "26%" },
						{ label: "spring · 110 / 16", left: "62%", top: "62%" },
						{ label: "layers · 7", left: "24%", top: "44%" },
					].map((chip) => (
						<span
							key={chip.label}
							className="absolute rounded-full border border-hairline bg-panel/90 px-[max(8px,1.3cqi)] py-[max(3px,0.5cqi)] font-display text-[max(8px,1.05cqi)] tracking-[0.2em] text-ink-dim uppercase shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)]"
							style={{ left: chip.left, top: chip.top }}
						>
							{chip.label}
						</span>
					))}
				</div>

				{/* depth -0.6 — nearest of all: a grain band at the bottom edge */}
				<div data-depth="-0.6" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden">
					<div
						className="absolute inset-0 opacity-40"
						style={{
							backgroundImage: `radial-gradient(${accent}55 1px, transparent 1px)`,
							backgroundSize: "9px 9px",
							maskImage: "linear-gradient(to top, black, transparent)",
						}}
					/>
				</div>
			</DepthStage>
		</div>
	);
}
