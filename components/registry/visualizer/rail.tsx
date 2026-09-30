"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { WeekIndex } from "./layout";
import { EASE } from "./motion";

export type RailOption = { key: string; label: string; spoken: string; week: WeekIndex | null };

type Band = { start: number; end: number };

/**
 * Days covered by each week bucket. `weekly` is the four most recent 7-day
 * buckets, so on a 30-day series W1 starts at day 2 and the first two days
 * only ever count toward "all".
 */
function weekBand(week: WeekIndex, days: number): Band {
	const start = Math.max(0, days - (4 - week) * 7);
	return { start, end: Math.min(days, start + 7) };
}

/**
 * The time range as a scrubbable histogram: one bar per day, a window that
 * snaps to whole weeks, and "all" as the stop before the first week.
 */
export function TimeRail({
	daily,
	options,
	value,
	onChange,
	label = "Time range",
	className,
	inert,
}: {
	/** Per day, oldest → newest. */
	daily: readonly number[];
	/** Stop order: the first option is the whole window (`week: null`). */
	options: readonly RailOption[];
	value: string;
	onChange: (key: string) => void;
	label?: string;
	className?: string;
	inert?: boolean;
}) {
	const days = Math.max(1, daily.length);
	const max = Math.max(1, ...daily);
	const stop = Math.max(0, options.findIndex((o) => o.key === value));
	const current = options[stop];
	const band: Band = current?.week == null ? { start: 0, end: days } : weekBand(current.week, days);
	const all = current?.week == null;
	const [dragging, setDragging] = React.useState(false);

	const go = (i: number) => {
		const next = options[Math.max(0, Math.min(options.length - 1, i))];
		if (next && next.key !== value) onChange(next.key);
	};

	// Map a pointer to the week under it; days before W1 snap to W1.
	const pick = (e: React.PointerEvent<HTMLDivElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		const day = Math.floor(((e.clientX - box.left) / Math.max(1, box.width)) * days);
		let best = -1;
		// Bands ascend, so the answer is the last week starting at or before the day.
		options.forEach((o, i) => {
			if (o.week === null) return;
			if (best === -1 || day >= weekBand(o.week, days).start) best = i;
		});
		if (best !== -1) go(best);
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		let next = stop;
		if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") next = stop + 1;
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown") next = stop - 1;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = options.length - 1;
		else return;
		e.preventDefault();
		go(next);
	};

	const pct = (d: number) => `${(100 * d) / days}%`;

	return (
		// Two rows: the pill and the track share row 1 at one height, so their edges
		// line up exactly; the week captions sit on row 2 under the track only.
		<div inert={inert} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5", className)}>
			<button
				type="button"
				aria-pressed={all}
				onClick={() => go(0)}
				className={cn(
					"h-7 rounded-full px-3 text-[12px] leading-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
					all ? "bg-accent text-on-accent" : "bg-raised text-ink-dim hover:text-ink",
				)}
			>
				{options[0]?.label}
			</button>
			<div
				role="slider"
				tabIndex={0}
				aria-label={label}
				aria-valuemin={0}
				aria-valuemax={options.length - 1}
				aria-valuenow={stop}
				aria-valuetext={current?.spoken}
				onKeyDown={onKeyDown}
				onPointerDown={(e) => {
					if (e.button !== 0 && e.pointerType === "mouse") return;
					e.currentTarget.setPointerCapture(e.pointerId);
					setDragging(true);
					pick(e);
				}}
				onPointerMove={(e) => {
					if (dragging) pick(e);
				}}
				onPointerUp={() => setDragging(false)}
				onPointerCancel={() => setDragging(false)}
				className={cn(
					"relative h-7 touch-none rounded-[8px] bg-raised outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/60",
					dragging ? "cursor-grabbing" : "cursor-pointer",
				)}
			>
				<span
					aria-hidden
					className="absolute inset-y-0 rounded-[8px] bg-accent-muted"
					style={{ left: pct(band.start), width: pct(band.end - band.start), transition: `left 320ms ${EASE}, width 320ms ${EASE}` }}
				/>
				<span aria-hidden className="absolute inset-0 flex items-end gap-px overflow-hidden rounded-[8px] p-[3px]">
					{daily.map((v, d) => {
						const on = d >= band.start && d < band.end;
						return (
							<span
								key={d}
								className={cn(
									"min-w-0 flex-1 rounded-[1.5px] transition-colors duration-200",
									on ? "bg-accent" : "bg-[color-mix(in_oklab,var(--color-ink-mute)_32%,var(--color-raised))]",
								)}
								style={{ height: `${Math.max(12, (100 * Math.max(0, v)) / max)}%` }}
							/>
						);
					})}
				</span>
			</div>
			<span aria-hidden />
			<div aria-hidden className="relative h-2.5">
				{options.map((o) => {
					if (o.week === null) return null;
					const b = weekBand(o.week, days);
					return (
						<span
							key={o.key}
							className={cn(
								"absolute top-0 -translate-x-1/2 font-mono text-[10px] leading-none transition-colors",
								o.key === value ? "text-accent" : "text-ink-mute",
							)}
							style={{ left: pct((b.start + b.end) / 2) }}
						>
							{o.label}
						</span>
					);
				})}
			</div>
		</div>
	);
}
