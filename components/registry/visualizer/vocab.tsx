import type * as React from "react";
import { ArrowUpRight, Clock3, Gauge, ListChecks, ShieldAlert, Timer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge, formatAgo, formatAgoLong, formatCount, formatMs, formatStamp, plural, READOUT } from "./format";
import type { FocusCardId } from "./layout";
import type { OrbitNodeData, OrbitRun, OrbitRunStatus } from "./types";

export type FocusCardSpec = { id: FocusCardId; icon: LucideIcon; value: string; label: string; spoken: string };

/**
 * What the drilldown shows for one node. Card ids are layout slots; the first
 * card owns the row list, the others open a panel.
 */
export type OrbitFocus = {
	/** 1–5 cards. */
	cards: (s: OrbitNodeData, now: number | null) => FocusCardSpec[];
	/** Up to 5 fixed-height rows. */
	rows: (s: OrbitNodeData, now: number | null) => { key: string; node: React.ReactNode }[];
	rowsTitle: (s: OrbitNodeData) => string;
	rowsNote: (s: OrbitNodeData) => string | null;
	emptyRows: string;
	panel: (s: OrbitNodeData, id: FocusCardId, now: number | null) => React.ReactNode;
	/** Generous panel heights, for keeping a panel inside the stage. */
	panelHeight: Partial<Record<FocusCardId, number>>;
	/** Pill under the orb; `group` is the label of the group it orbits. */
	chip: (s: OrbitNodeData, group: string) => string;
	ringCaption: string;
};

/**
 * Every word the orbit says. Swap it to point the same constellation at another
 * domain — the geometry never changes. Complete, not Partial, so a new string
 * can't silently mix two domains.
 */
export type OrbitVocab = {
	/** Label on the sun. */
	sun: string;
	/** What a node's value counts: "task" / "tasks". */
	unit: readonly [one: string, many: string];
	/** What a ring-2 node is. */
	node: readonly [one: string, many: string];
	/** What a ring-1 node is. */
	group: readonly [one: string, many: string];
	/** Uncountable total, as in "12% of the work". */
	mass: string;
	/** The attention flag carried in `OrbitNodeData.flagged`. */
	flag: { label: string; chip: string; clear: string };
	/** Time-range toggle over `OrbitNodeData.weekly`; null hides it. */
	period: {
		all: { label: string; spoken: string };
		weeks: readonly (readonly [label: string, spoken: string])[];
	} | null;
	/** Window phrases: "30 days", "week 2". */
	window: { all: string; week: (index: number) => string };
	legend: { person: string; machine: string; ring: string; hint: string };
	srHint: string;
	sceneLabel: string;
	empty: { title: string; body: string };
	/** Tooltip line, e.g. "Last run 3h ago". */
	recency: (s: OrbitNodeData, now: number) => string;
	/** Spoken, e.g. "last run 3 hours ago". */
	recencyLong: (s: OrbitNodeData, now: number) => string;
	/** Compact list cell. */
	ago: (s: OrbitNodeData, now: number) => string;
	/** Announcement when a node opens. */
	describe: (s: OrbitNodeData, now: number | null) => string;
	focus: OrbitFocus;
	/** A full view behind a "View all" button under the drilldown's rows. */
	expand?: { label: (s: OrbitNodeData) => string; render: (s: OrbitNodeData) => React.ReactNode };
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ─── the default domain: agents and tools around an orchestrator ─── */

const HOUR = 3_600_000;

const STATUS: Record<OrbitRunStatus, { label: string; color: string }> = {
	ok: { label: "Done", color: "var(--co-agent)" },
	running: { label: "Running", color: "var(--co-filament)" },
	blocked: { label: "Blocked", color: "var(--co-accent)" },
	failed: { label: "Failed", color: "#f87171" },
};

/** Share of finished runs that succeeded; null when nothing has finished. */
function successRate(s: OrbitNodeData): number | null {
	const done = s.recent.filter((r) => r.status !== "running");
	if (!done.length) return null;
	return Math.round((100 * done.filter((r) => r.status === "ok").length) / done.length);
}

function agentCards(s: OrbitNodeData, now: number | null): FocusCardSpec[] {
	const median = formatMs(s.medianMs);
	const ago = now === null ? "—" : formatAgo(s.lastAt, now);
	const cards: FocusCardSpec[] = [
		{ id: "rows", icon: ListChecks, value: formatCount(s.count), label: "Tasks", spoken: plural(s.count, "task") },
		{ id: "flagged", icon: ShieldAlert, value: formatCount(s.flagged), label: "Blocked", spoken: `${formatCount(s.flagged)} blocked` },
		{ id: "timing", icon: Timer, value: median, label: "Median run", spoken: median === "—" ? "median run time unknown" : `median run ${median}` },
		{ id: "recency", icon: Clock3, value: ago, label: "Last run", spoken: `last run ${ago}` },
	];
	const rate = successRate(s);
	if (rate !== null) cards.push({ id: "extra", icon: Gauge, value: `${rate}%`, label: "Success rate", spoken: `${rate} percent of runs succeed` });
	return cards;
}

function RunRow({ run, now }: { run: OrbitRun; now: number | null }) {
	const age = now === null ? null : Math.max(0, (now - Date.parse(run.at)) / HOUR);
	const tone = STATUS[run.status];
	const body = (
		<>
			<span className="size-2 shrink-0 rounded-full" style={{ background: tone.color }} />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[13.5px] leading-tight text-ink">{run.title}</span>
				<span className="mt-0.5 block truncate text-[11.5px] text-ink-dim">
					{tone.label} · {formatStamp(run.at)}
					{run.durationMs !== null && ` · ${formatMs(run.durationMs)}`}
				</span>
			</span>
			<span className="shrink-0 font-mono text-[11px] text-ink-dim tabular-nums">{age === null ? "" : formatAge(age)}</span>
		</>
	);
	const shell = "group flex h-full items-center gap-3 rounded-[14px] bg-raised px-3.5 ring-1 ring-hairline";
	if (!run.href) return <div className={shell}>{body}</div>;
	return (
		<a
			href={run.href}
			className={cn(
				shell,
				"transition-shadow duration-200 hover:ring-(--co-accent)/40 focus-visible:ring-2 focus-visible:ring-(--co-filament)/60 focus-visible:outline-none",
			)}
		>
			{body}
			<ArrowUpRight className="size-3.5 shrink-0 text-ink-mute transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
		</a>
	);
}

function WeeklyBars({ weekly, title }: { weekly: number[]; title: string }) {
	const weeks = [0, 1, 2, 3].map((i) => weekly[i] ?? 0);
	const max = Math.max(1, ...weeks);
	return (
		<div className="mt-4">
			<p className={READOUT}>{title}</p>
			<ul className="mt-2 grid grid-cols-4 items-end gap-2" style={{ height: 64 }}>
				{weeks.map((v, i) => (
					<li key={i} className="flex h-full flex-col items-center justify-end gap-1">
						<span className="font-mono text-[10.5px] text-ink-dim tabular-nums">{v}</span>
						<span
							className={cn("w-full rounded-[4px]", i === 3 ? "bg-(--co-accent)" : "bg-ink/15")}
							style={{ height: `${Math.max(3, (v / max) * 36)}px` }}
						/>
						<span className="font-mono text-[10px] text-ink-mute">W{i + 1}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function Big({ children }: { children: React.ReactNode }) {
	return <p className="mt-2 text-[34px] leading-none text-ink tabular-nums">{children}</p>;
}

function AgentPanel({ s, id, now }: { s: OrbitNodeData; id: FocusCardId; now: number | null }) {
	if (id === "flagged") {
		const stuck = s.recent.filter((r) => r.status === "blocked" || r.status === "failed").slice(0, 3);
		return (
			<>
				<p className={READOUT}>Blocked</p>
				<Big>{formatCount(s.flagged)}</Big>
				{stuck.length === 0 ? (
					<p className="mt-2 text-[13px] text-ink-dim">Nothing is waiting on a human.</p>
				) : (
					<ul className="mt-3 flex flex-col gap-2">
						{stuck.map((r) => (
							<li key={r.id} className="flex min-w-0 items-center gap-2 text-[12.5px]">
								<span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS[r.status].color }} />
								<span className="truncate text-ink">{r.title}</span>
							</li>
						))}
					</ul>
				)}
			</>
		);
	}
	if (id === "timing") {
		const slowest = [...s.recent].filter((r) => r.durationMs !== null).sort((a, b) => b.durationMs! - a.durationMs!)[0];
		return (
			<>
				<p className={READOUT}>Median run</p>
				<Big>{formatMs(s.medianMs)}</Big>
				{slowest && (
					<p className="mt-2 truncate text-[13px] text-ink-dim">
						Slowest recent: {slowest.title} · {formatMs(slowest.durationMs)}
					</p>
				)}
				<WeeklyBars weekly={s.weekly} title="Tasks per week" />
			</>
		);
	}
	if (id === "extra") {
		const counts = (["ok", "failed", "blocked"] as const).map((k) => ({ k, n: s.recent.filter((r) => r.status === k).length }));
		const done = counts.reduce((a, c) => a + c.n, 0) || 1;
		return (
			<>
				<p className={READOUT}>Success rate</p>
				<Big>{successRate(s) ?? "—"}%</Big>
				<div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-ink/10">
					{counts.map(({ k, n }) => (
						<span key={k} className="h-full" style={{ width: `${(100 * n) / done}%`, background: STATUS[k].color }} />
					))}
				</div>
				<p className="mt-2 text-[13px] text-ink-dim">
					{counts.map(({ k, n }) => `${n} ${STATUS[k].label.toLowerCase()}`).join(" · ")} · last {plural(s.recent.length, "run")}
				</p>
			</>
		);
	}
	return (
		<>
			<p className={READOUT}>Last run</p>
			<p className="mt-2 text-[28px] leading-none text-ink">{now === null ? "—" : formatAgo(s.lastAt, now)}</p>
			<p className="mt-1.5 text-[13px] text-ink-dim">{formatStamp(s.lastAt)}</p>
			<WeeklyBars weekly={s.weekly} title="Per week" />
		</>
	);
}

export const AGENT_FOCUS: OrbitFocus = {
	cards: agentCards,
	rows: (s, now) => s.recent.slice(0, 5).map((run) => ({ key: run.id, node: <RunRow run={run} now={now} /> })),
	rowsTitle: () => "Latest runs",
	rowsNote: (s) => (s.flagged > 0 ? `${formatCount(s.flagged)} blocked` : null),
	emptyRows: "No runs in this window.",
	panel: (s, id, now) => <AgentPanel s={s} id={id} now={now} />,
	panelHeight: { flagged: 220, timing: 236, recency: 244, extra: 190 },
	chip: (s, group) => `${group} · ${s.kind === "agent" ? "Agent" : "Tool"}`,
	ringCaption: "30 days · 1 tick = 1 day",
};

export const AGENT_VOCAB: OrbitVocab = {
	sun: "Orchestrator",
	unit: ["task", "tasks"],
	node: ["worker", "workers"],
	group: ["pool", "pools"],
	mass: "the work",
	flag: { label: "blocked", chip: "blocked", clear: "All clear" },
	period: {
		all: { label: "All", spoken: "All 30 days" },
		weeks: [
			["W1", "Week 1, the oldest"],
			["W2", "Week 2"],
			["W3", "Week 3"],
			["W4", "Week 4, the most recent"],
		],
	},
	window: { all: "30 days", week: (i) => `week ${i + 1}` },
	legend: { person: "Agents", machine: "Tools", ring: "Ring around the orchestrator: tasks per day, 30 days", hint: "Select an agent or tool to focus" },
	srHint: "Arrow keys move between agents and tools. Enter opens one. Escape returns.",
	sceneLabel: "Agents and tools in orbit around the orchestrator",
	empty: {
		title: "Nothing in orbit yet",
		body: "Once agents start taking work, the busiest agents and tools will circle here, grouped by pool.",
	},
	recency: (s, now) => `Last run ${formatAgo(s.lastAt, now)}`,
	recencyLong: (s, now) => `last run ${formatAgoLong(s.lastAt, now)}`,
	ago: (s, now) => formatAgo(s.lastAt, now),
	describe: (s, now) =>
		agentCards(s, now)
			.map((c) => c.spoken)
			.join(", "),
	focus: AGENT_FOCUS,
};
