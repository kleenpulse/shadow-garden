"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Sheet from "./sheet";

// A small app screen with a sheet over it: a list you can still reach at
// peek, and enough inside the sheet that the full height has something to
// scroll.

const OPERATIONS = [
	{ code: "α", name: "Old cathedral", note: "Council at midnight", state: "Tonight" },
	{ code: "β", name: "Royal library", note: "Chapter twelve, final proof", state: "Open" },
	{ code: "γ", name: "Mitsugoshi vault", note: "Quarterly count", state: "Open" },
	{ code: "δ", name: "North woods", note: "Something big was seen", state: "Hold" },
	{ code: "ε", name: "Concert hall", note: "Front row, two seats", state: "Done" },
	{ code: "ζ", name: "Holy City", note: "Watch from the rooftops", state: "Open" },
];

const STEPS = [
	"Enter by the east cloister after the last bell.",
	"Seven seats. Take the one nearest the door.",
	"Bring nothing that shines.",
	"Speak only when the candle is passed to you.",
	"Leave one at a time, the way you came.",
	"If the bell rings twice, do not go in.",
];

function Brief() {
	return (
		<div className="flex flex-col gap-4 text-[13px] leading-relaxed text-ink-dim">
			<p>
				All seven of us, at midnight. The cathedral has been empty since the
				fire, so nobody will ask why the lamps are lit.
			</p>
			<div className="grid grid-cols-3 gap-2">
				{[
					["When", "00:00"],
					["Seats", "7"],
					["Risk", "Low"],
				].map(([key, value]) => (
					<div
						key={key}
						className="rounded-lg border border-hairline bg-raised px-3 py-2"
					>
						<div className="font-display text-[9px] tracking-[0.22em] text-ink-mute uppercase">
							{key}
						</div>
						<div className="mt-0.5 text-[15px] font-semibold text-ink tabular-nums">
							{value}
						</div>
					</div>
				))}
			</div>
			<ol className="flex flex-col">
				{STEPS.map((step, i) => (
					<li
						key={step}
						className="flex gap-3 border-t border-hairline py-2.5 first:border-t-0"
					>
						<span className="font-display text-[10px] text-ink-mute tabular-nums">
							{String(i + 1).padStart(2, "0")}
						</span>
						<span className="text-ink">{step}</span>
					</li>
				))}
			</ol>
		</div>
	);
}

export default function SheetPreview({ values, reducedMotion }: PreviewProps) {
	const [open, setOpen] = useState(true);

	return (
		<div className="@container relative h-full w-full">
			<div className="absolute inset-0 flex items-center justify-center p-3 @md:p-8">
				<div className="h-full max-h-[34rem] w-full max-w-sm overflow-hidden rounded-xl border border-hairline">
					<Sheet
						open={open}
						onOpenChange={setOpen}
						label="Mission brief"
						title="Council at the old cathedral"
						content={<Brief />}
						peek={values.peek as number}
						half={values.half as number}
						stiffness={values.stiffness as number}
						damping={values.damping as number}
						rubberBand={values.rubberBand as number}
						backdrop={values.backdrop as number}
						recede={values.recede as boolean}
						dismissible={values.dismissible as boolean}
						accentColor={values.accentColor as string}
						reducedMotion={reducedMotion}
					>
						<div className="flex h-full flex-col bg-surface text-ink">
							<div className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
								<span className="text-[15px] font-semibold">Operations</span>
								<span className="font-display text-[10px] tracking-[0.18em] text-ink-mute uppercase tabular-nums">
									{OPERATIONS.length} listed
								</span>
								<button
									type="button"
									onClick={() => setOpen(true)}
									disabled={open}
									className="ml-auto cursor-pointer rounded-md border border-hairline bg-raised px-2.5 py-1 text-[12px] font-medium text-ink transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40"
								>
									Open brief
								</button>
							</div>
							<ul className="min-h-0 flex-1 overflow-y-auto">
								{OPERATIONS.map((op) => (
									<li
										key={op.code}
										className="flex items-center gap-3 border-b border-hairline px-4 py-2.5"
									>
										<span
											aria-hidden
											className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-raised font-serif text-[15px] text-ink-dim"
										>
											{op.code}
										</span>
										<div className="min-w-0 flex-1">
											<p className="truncate text-[13px] font-medium">{op.name}</p>
											<p className="truncate text-[12px] text-ink-mute">{op.note}</p>
										</div>
										<span className="shrink-0 font-display text-[9px] tracking-[0.2em] text-ink-mute uppercase">
											{op.state}
										</span>
									</li>
								))}
							</ul>
						</div>
					</Sheet>
				</div>
			</div>
		</div>
	);
}
