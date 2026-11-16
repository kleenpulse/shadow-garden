"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Kusanagi, { type KusanagiDensity } from "./kusanagi";

// The composition IS the template: the field runs full-bleed and the component
// carries the title, the button, the grain and the thin frame. This layer adds
// the editorial copy a real page would set inside that frame, built the way a
// consumer would build it: a wordmark, two numbered notes, a vertical label
// and a wind readout that follows the control. No nav on purpose: the frame is
// the chrome here.
//
// Type is container-query sized (@container + cqi) so the bench preview and
// the fullscreen stage share one layout. Everything here hides below @xl,
// where the frame alone is enough, and the lower pieces also hide in portrait,
// where the title owns the bottom edge. The bottom-right corner stays empty:
// the fullscreen stage parks its settings button there.
const INK = "rgba(255,255,255,0.86)";
const INK_DIM = "rgba(255,255,255,0.62)";
const INK_FAINT = "rgba(255,255,255,0.45)";

const INSET = "max(14px,3.2cqi)";
const NOTE = "font-display text-[max(7px,0.82cqi)] leading-[1.7] tracking-[0.2em] uppercase";

export default function KusanagiPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const wind = values.wind as number;

	// The wind readout grows while the wind control is being moved, then eases
	// back to its own size a moment after the last change.
	const [tuning, setTuning] = useState(false);
	const firstWind = useRef(true);
	useEffect(() => {
		if (firstWind.current) {
			firstWind.current = false;
			return;
		}
		setTuning(true);
		const id = setTimeout(() => setTuning(false), 650);
		return () => clearTimeout(id);
	}, [wind]);
	const grown = tuning && !reducedMotion;
	return (
		<div className="relative h-full min-h-80 w-full @container-size">
			<Kusanagi
				title="Kusanagi"
				subtitle="The field bows to one blade."
				ctaLabel="Draw the blade"
				distance={values.distance as number}
				density={values.density as KusanagiDensity}
				grassColor={values.grassColor as string}
				tipColor={values.tipColor as string}
				fogColor={values.fogColor as string}
				steelColor={values.steelColor as string}
				wind={wind}
				fog={values.fog as number}
				grassHeight={values.grassHeight as number}
				grain={values.grain as number}
				frame={values.frame as boolean}
				cut={values.cut as boolean}
				autoRotate={values.autoRotate as boolean}
				parallax={values.parallax as boolean}
				intro={values.intro as boolean}
				paused={paused}
				reducedMotion={reducedMotion}
			/>

			<div
				className="pointer-events-none absolute z-10 hidden flex-col items-end @xl:flex"
				style={{ right: INSET, top: INSET }}
			>
				<span
					className="font-serif text-[max(18px,3.4cqi)] leading-none italic"
					style={{ color: INK }}
				>
					Motion Garden
				</span>
				<span
					className="mt-[max(5px,0.8cqi)] font-display text-[max(7px,0.82cqi)] tracking-[0.3em] uppercase"
					style={{ color: INK_DIM }}
				>
					Field record · Vol. VII
				</span>
			</div>

			<div
				className="pointer-events-none absolute top-[max(34px,7.4cqi)] z-10 hidden max-w-[max(200px,34cqi)] gap-[max(8px,1.2cqi)] @xl:flex"
				style={{ left: INSET }}
			>
				<span className={NOTE} style={{ color: INK }}>
					01
				</span>
				<p className={NOTE} style={{ color: INK_DIM }}>
					The blade was left here before the first war. No one has pulled it out.
				</p>
			</div>

			<div
				className="pointer-events-none absolute top-[calc(46%+max(26px,3.6cqi))] z-10 hidden w-[max(140px,33cqi)] justify-end gap-[max(8px,1.2cqi)] text-right [@container(orientation:landscape)]:@xl:flex"
				style={{ right: INSET }}
			>
				<p className={NOTE} style={{ color: INK_DIM }}>
					Cut the grass and it grows back by morning. The field does not keep a mark.
				</p>
				<span className={NOTE} style={{ color: INK }}>
					02
				</span>
			</div>

			<span
				className="pointer-events-none absolute top-1/2 z-10 hidden -translate-y-1/2 rotate-180 font-display text-[max(7px,0.82cqi)] tracking-[0.34em] uppercase [writing-mode:vertical-rl] [@container(orientation:landscape)]:@xl:block"
				style={{ left: INSET, color: INK_FAINT }}
			>
				Seven shades stand watch
			</span>

			<div
				className="pointer-events-none absolute bottom-[max(22px,4.6cqi)] z-10 hidden origin-bottom-left flex-col [@container(orientation:landscape)]:@xl:flex"
				style={{
					left: INSET,
					transform: grown ? "scale(1.4)" : "none",
					transition: grown
						? "transform 260ms cubic-bezier(0.22,1,0.36,1)"
						: "transform 700ms cubic-bezier(0.22,1,0.36,1)",
				}}
			>
				<span
					className="font-display text-[max(7px,0.82cqi)] tracking-[0.26em] uppercase"
					style={{ color: INK_FAINT }}
				>
					wind
				</span>
				<span
					className="font-display text-[max(10px,1.25cqi)] tracking-widest"
					style={{ color: INK }}
				>
					{(wind * 4.2).toFixed(1)} m · s⁻¹
				</span>
			</div>
		</div>
	);
}
