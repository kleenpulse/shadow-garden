"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import BorderGlow from "@/components/registry/border-glow/border-glow";
import { AnimatedNumber } from "@/components/registry/animated-number/animated-number";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import type { LandingData } from "@/components/landing/data";
import { useMediaQuery } from "@/hooks/use-media-query";

// BorderGlow's glowColor is an "H S L" triplet string; convert from the hex the
// registry stores (same conversion the workspace preview does).
function hexToHsl(hex: string): string {
	let h = hex.replace("#", "").trim();
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	const r = parseInt(h.slice(0, 2), 16) / 255;
	const g = parseInt(h.slice(2, 4), 16) / 255;
	const b = parseInt(h.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let hue = 0;
	let s = 0;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				hue = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				hue = (b - r) / d + 2;
				break;
			default:
				hue = (r - g) / d + 4;
		}
		hue /= 6;
	}
	return `${Math.round(hue * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`;
}

// Calibration proof: a live BorderGlow wired to two real registry dials.
// Local state only — the landing page never touches the URL.
export default function TuningProof({
	tuning,
}: {
	tuning: LandingData["tuning"];
}) {
	const reduce = useReducedMotion() ?? false;
	const [values, setValues] = useState<Record<string, number>>(() =>
		Object.fromEntries(tuning.sliders.map((s) => [s.name, s.default])),
	);
	const compact = useMediaQuery("(max-width: 640px)");

	return (
		<div className="grid items-center gap-10 lg:grid-cols-[1fr_320px]">
			<div className="flex items-center justify-center py-4">
				<PreviewBoundary slug="border-glow" label="BorderGlow" variant="stage">
					<BorderGlow
						className="w-full sm:w-80"
						glowColor={hexToHsl(tuning.glowColor)}
						backgroundColor="var(--color-panel)"
						glowRadius={values.glowRadius}
						coneSpread={values.coneSpread}
						glowIntensity={tuning.glowIntensity}
						edgeSensitivity={tuning.edgeSensitivity}
						borderRadius={tuning.borderRadius}
						fillOpacity={tuning.fillOpacity}
						animateInView={!reduce}
					>
						<div className="flex h-52 w-full items-center justify-center p-6 text-center font-display text-xs uppercase tracking-[0.2em] text-ink-dim">
							{compact ? "Tap " : "Trace "}the edges
						</div>
					</BorderGlow>
				</PreviewBoundary>
			</div>

			<div className="flex flex-col gap-7">
				{tuning.sliders.map((slider) => (
					<label key={slider.name} className="block">
						<span className="flex items-baseline justify-between font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute">
							<span>{slider.label}</span>
							<span className="flex items-baseline gap-1 text-ink">
								<PreviewBoundary
									slug="animated-number"
									label="AnimatedNumber"
									variant="silent"
								>
									<AnimatedNumber
										value={values[slider.name]}
										animationType="flip"
										duration={0.25}
										className="font-display text-sm"
									/>
								</PreviewBoundary>
								{slider.unit ? <span>{slider.unit}</span> : null}
							</span>
						</span>
						<input
							type="range"
							className="bench-range mt-3 w-full"
							min={slider.min}
							max={slider.max}
							step={slider.step}
							value={values[slider.name]}
							onChange={(event) =>
								setValues((prev) => ({
									...prev,
									[slider.name]: Number(event.target.value),
								}))
							}
						/>
					</label>
				))}
				<p className="font-sans text-xs leading-relaxed text-ink-mute">
					Every specimen in the catalog exposes its dials like this — tuned
					live, reflected in the props table, ready to copy.
				</p>
			</div>
		</div>
	);
}
