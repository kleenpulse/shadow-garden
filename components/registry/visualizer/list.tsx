"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { senderValue, type OrbitCategory, type WeekIndex } from "./layout";
import { displayName, formatCount, plural } from "./format";
import type { OrbitNodeData } from "./types";
import { capitalize, type OrbitVocab } from "./vocab";

function initials(name: string, fallback: string): string {
	const words = (name.trim() || fallback).split(/[\s._@-]+/).filter(Boolean);
	const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2);
	return letters.toUpperCase();
}

const PREVIEW_ROWS = 8;

export function OrbitList({
	senders,
	categories,
	week,
	now,
	vocab,
	onOpen,
}: {
	senders: OrbitNodeData[];
	categories: OrbitCategory[];
	week: WeekIndex | null;
	now: number | null;
	vocab: OrbitVocab;
	onOpen: (id: string) => void;
}) {
	const [expanded, setExpanded] = React.useState(false);
	const ranked = React.useMemo(
		() =>
			senders
				.map((s, i) => ({ s, i, v: senderValue(s, week) }))
				.sort((a, b) => b.v - a.v || b.s.count - a.s.count || a.i - b.i),
		[senders, week],
	);
	const shown = expanded ? ranked : ranked.slice(0, PREVIEW_ROWS);
	const byShare = [...categories].sort((a, b) => b.value - a.value || a.order - b.order);
	const period = week === null ? vocab.window.all : vocab.window.week(week);
	const labelOf = new Map(categories.map((c) => [c.id, c.label]));

	return (
		<div className="@container flex flex-col gap-5">
			<CategoryBar categories={byShare} label={`${capitalize(vocab.mass)} by ${vocab.group[0]}, ${period}`} />
			<ol aria-label={`${capitalize(vocab.node[1])} ranked by ${vocab.mass}, ${period}`} className="flex flex-col gap-1">
				{shown.map(({ s, v }, idx) => (
					<li key={s.id}>
						<Row sender={s} group={labelOf.get(s.group) ?? s.group} rank={idx + 1} value={v} week={week} now={now} vocab={vocab} onOpen={onOpen} />
					</li>
				))}
			</ol>
			{ranked.length > PREVIEW_ROWS && (
				<button
					type="button"
					onClick={() => setExpanded((x) => !x)}
					aria-expanded={expanded}
					className="self-start rounded-full px-3.5 py-2 text-[13px] text-ink-dim ring-1 ring-hairline transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-(--co-filament)/60 focus-visible:outline-none"
				>
					{expanded ? "Show top 8" : `Show all ${ranked.length} ${vocab.node[1]}`}
				</button>
			)}
		</div>
	);
}

function CategoryBar({ categories, label }: { categories: OrbitCategory[]; label: string }) {
	const total = categories.reduce((a, c) => a + c.value, 0);
	const summary = categories.map((c) => `${c.label} ${c.shareText}`).join(", ");
	return (
		<div>
			<div role="img" aria-label={`${label}: ${summary}`} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
				{total > 0 &&
					categories.map((c, i) => (
						<span
							key={c.id}
							className="h-full transition-[flex-grow] duration-500"
							style={{
								flexGrow: c.value,
								flexBasis: 0,
								minWidth: c.value > 0 ? 3 : 0,
								background: `color-mix(in oklab, var(--co-cat-${c.tone}) ${Math.max(28, 100 - i * 12)}%, transparent)`,
							}}
						/>
					))}
			</div>
			<ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-dim" aria-hidden>
				{categories.map((c, i) => (
					<li key={c.id} className="inline-flex items-center gap-1.5">
						<span
							className="size-2 rounded-full"
							style={{ background: `color-mix(in oklab, var(--co-cat-${c.tone}) ${Math.max(28, 100 - i * 12)}%, transparent)` }}
						/>
						{c.label}
						<span className="text-ink tabular-nums">{c.shareText}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function Row({
	sender,
	group,
	rank,
	value,
	week,
	now,
	vocab,
	onOpen,
}: {
	sender: OrbitNodeData;
	group: string;
	rank: number;
	value: number;
	week: WeekIndex | null;
	now: number | null;
	vocab: OrbitVocab;
	onOpen: (id: string) => void;
}) {
	const person = sender.kind === "agent";
	const name = displayName(sender);
	const label = [
		`${rank}. ${name}`,
		week === null ? plural(value, vocab.unit[0], vocab.unit[1]) : `${plural(value, vocab.unit[0], vocab.unit[1])} in ${vocab.window.week(week)}`,
		`${formatCount(sender.flagged)} ${vocab.flag.label}`,
		group,
		now === null ? null : vocab.recencyLong(sender, now),
	]
		.filter(Boolean)
		.join(", ");

	return (
		<button
			type="button"
			data-orbit-row={sender.id}
			onClick={() => onOpen(sender.id)}
			aria-label={label}
			className={cn(
				"group grid h-[52px] w-full items-center gap-2 rounded-[14px] px-2.5 text-left transition-colors duration-150 @xl:gap-3",
				// Every row is its own grid, so tracks are fixed or fractional (never auto) to keep columns aligned.
				"grid-cols-[1.25rem_2rem_minmax(0,1fr)_2.25rem_3.5rem]",
				"@xl:grid-cols-[1.5rem_2rem_minmax(0,1fr)_6.5rem_2.75rem_4.25rem_1rem]",
				"@3xl:grid-cols-[1.5rem_2rem_minmax(0,1.25fr)_minmax(6.5rem,0.55fr)_minmax(6.5rem,1fr)_3rem_4.5rem_4.5rem_1rem]",
				"hover:bg-raised focus-visible:ring-2 focus-visible:ring-(--co-filament)/60 focus-visible:outline-none",
			)}
		>
			<span className="font-mono text-[11px] text-ink-mute tabular-nums">{rank}</span>
			<span
				className={cn(
					"grid size-8 place-items-center rounded-full font-mono text-[10px] font-semibold text-[#0b1616]",
					person ? "bg-(--co-agent)" : "bg-(--co-tool)",
				)}
			>
				{initials(sender.name, sender.id)}
			</span>
			<span className="min-w-0">
				<span className="block truncate text-[14px] leading-tight text-ink">{name}</span>
				<span className="block truncate text-[11.5px] text-ink-dim">{sender.detail}</span>
			</span>
			<span className="hidden truncate text-[12px] text-ink-dim @xl:block">{group}</span>
			<Spark daily={sender.daily} week={week} person={person} className="hidden h-5 w-full @3xl:block" />
			<span className={cn("text-right text-[16px] text-ink tabular-nums", value === 0 && "text-ink-mute")}>{formatCount(value)}</span>
			<span className="flex justify-start">
				{sender.flagged > 0 && (
					<span className="rounded-full bg-(--co-accent)/15 px-2 py-0.5 text-[11px] whitespace-nowrap text-[color-mix(in_oklab,var(--co-accent)_72%,var(--sg-ink))] tabular-nums">
						{sender.flagged} {vocab.flag.chip}
					</span>
				)}
			</span>
			<span className="hidden text-right text-[12px] text-ink-dim @3xl:block">{now === null ? "" : vocab.ago(sender, now)}</span>
			<ChevronRight className="hidden size-4 text-ink-mute transition-transform duration-150 group-hover:translate-x-0.5 @xl:block" />
		</button>
	);
}

/** 30 daily bars; in week mode the chosen week stays lit. */
function Spark({ daily, week, person, className }: { daily: number[]; week: WeekIndex | null; person: boolean; className?: string }) {
	const n = daily.length || 1;
	const max = Math.max(1, ...daily);
	const W = 104;
	const H = 20;
	const bw = W / n;
	const start = week === null ? -1 : n - 28 + week * 7;
	return (
		<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
			{daily.map((v, i) => {
				const h = v > 0 ? Math.max(2, (v / max) * H) : 1;
				const inWeek = week === null || (i >= start && i < start + 7);
				return (
					<rect
						key={i}
						x={i * bw + 0.5}
						y={H - h}
						width={Math.max(1, bw - 1.2)}
						height={h}
						rx={0.8}
						className={person ? "fill-(--co-agent)" : "fill-(--co-tool)"}
						opacity={v === 0 ? 0.25 : inWeek ? 0.95 : 0.22}
					/>
				);
			})}
		</svg>
	);
}
