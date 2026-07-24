"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";

import type { PreviewProps } from "@/lib/registry/types";
import Dissolve from "./Dissolve";

// The card is themed DOM (bench tokens). Its canvas twin is authored pixels, so
// the PREVIEW owns theme awareness — it hands paint() a matching palette.
const PALETTE = {
	dark: {
		panel: "#17171c",
		hairline: "rgba(237,237,242,0.09)",
		accent: "#a855f7",
		ink: "#ededf2",
		inkDim: "rgba(237,237,242,0.62)",
	},
	light: {
		panel: "#ffffff",
		hairline: "rgba(20,20,26,0.10)",
		accent: "#7e22ce",
		ink: "#1a1a1f",
		inkDim: "rgba(26,26,31,0.60)",
	},
} as const;

const PAD_X = 24;
const PAD_Y = 20;
const BODY_LINES = [
	"Trigger-driven pixel",
	"disintegration. Motes",
	"drift, swirl, and settle",
	"back on reform.",
];

function roundRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

export default function DissolvePreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Pin dark until mounted so hydration matches the default theme.
	const isDark = !mounted || resolvedTheme !== "light";
	const pal = isDark ? PALETTE.dark : PALETTE.light;

	// Local mirror of the tuned `dismissed` so the button can also drive it.
	const [dismissed, setDismissed] = useState<boolean>(
		values.dismissed as boolean,
	);
	useEffect(() => {
		setDismissed(values.dismissed as boolean);
	}, [values.dismissed]);

	const paint = useCallback(
		(ctx: CanvasRenderingContext2D, w: number, h: number) => {
			// Panel fill + hairline border.
			roundRectPath(ctx, 0, 0, w, h, 10);
			ctx.fillStyle = pal.panel;
			ctx.fill();
			roundRectPath(ctx, 0.5, 0.5, w - 1, h - 1, 10);
			ctx.strokeStyle = pal.hairline;
			ctx.lineWidth = 1;
			ctx.stroke();

			// Amethyst accent tick, top-left.
			ctx.fillStyle = pal.accent;
			ctx.fillRect(PAD_X, PAD_Y + 1, 14, 3);

			// letterSpacing lands in different lib.dom versions — write it loosely.
			const spaced = ctx as { letterSpacing?: string };

			// Heading — Space Mono, uppercase, tracked.
			ctx.textBaseline = "top";
			ctx.fillStyle = pal.ink;
			ctx.font = '700 13px "Space Mono", ui-monospace, monospace';
			spaced.letterSpacing = "2.6px";
			ctx.fillText("DISSOLVE", PAD_X, PAD_Y + 12);

			// Body lines.
			ctx.fillStyle = pal.inkDim;
			ctx.font = '400 12px "Space Mono", ui-monospace, monospace';
			spaced.letterSpacing = "0px";
			let y = PAD_Y + 42;
			for (const line of BODY_LINES) {
				ctx.fillText(line, PAD_X, y);
				y += 18;
			}
		},
		[pal],
	);

	return (
		<div className="flex h-full min-h-72 w-full flex-col items-center justify-center gap-6">
			<Dissolve
				paint={paint}
				dismissed={dismissed}
				particleGap={values.particleGap as number}
				drift={values.drift as number}
				duration={values.duration as number}
				stagger={values.stagger as number}
				gravity={values.gravity as number}
				swirl={values.swirl as number}
				reformOnTrigger={values.reformOnTrigger as boolean}
				moteColor={values.moteColor as string}
				reducedMotion={reducedMotion}
			>
				<div className="w-72 rounded-[10px] border border-hairline bg-panel px-6 py-5">
					<div className="h-[3px] w-3.5 bg-accent" />
					<h3 className="mt-3 font-display text-[13px] font-bold uppercase tracking-[0.2em] text-ink">
						Dissolve
					</h3>
					<p className="mt-2 font-display text-[12px] leading-[18px] text-ink-dim">
						Trigger-driven pixel disintegration. Motes drift, swirl,
						and settle back on reform.
					</p>
				</div>
			</Dissolve>

			<button
				type="button"
				onClick={() => setDismissed((d) => !d)}
				className="rounded-md border border-hairline bg-raised px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-ink-dim transition-colors hover:bg-accent/15 hover:text-ink focus-visible:bg-accent/15 focus-visible:outline-none"
			>
				{dismissed ? "Reform" : "Dismiss"}
			</button>
		</div>
	);
}
