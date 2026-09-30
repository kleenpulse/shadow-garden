"use client";

import * as React from "react";
import { List as ListIcon, Orbit as OrbitIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackButton, Drilldown, Kbd } from "./drilldown";
import { displayName, formatCount, plural, READOUT } from "./format";
import { useContainerWidth, useInView, useNow, usePageVisible } from "./hooks";
import {
	MAX_SENDERS,
	categoryShares,
	combinedDaily,
	layoutFocus,
	layoutOrbit,
	normalizeSenders,
	type OrbitSender,
	type WeekIndex,
} from "./layout";
import { OrbitList } from "./list";
import { BEAM_MS, BLOOM_MS, EASE, IGNITION_MS } from "./motion";
import { TimeRail } from "./rail";
import { OrbitScene, makeOrbitIds, type SceneFocus } from "./scene";
import { Segmented } from "./segmented";
import type { OrbitGroup, OrbitNodeData } from "./types";
import { AGENT_VOCAB, capitalize, type OrbitVocab } from "./vocab";

type View = "constellation" | "list";
type WeekKey = "all" | "w1" | "w2" | "w3" | "w4";
type WeekOption = { key: WeekKey; label: string; spoken: string; week: WeekIndex | null };

const WEEK_KEYS = ["w1", "w2", "w3", "w4"] as const;

function weekOptions(period: OrbitVocab["period"]): WeekOption[] {
	if (!period) return [{ key: "all", label: "", spoken: "", week: null }];
	return [
		{ key: "all", ...period.all, week: null },
		...period.weeks.slice(0, 4).map(([label, spoken], i) => ({ key: WEEK_KEYS[i]!, label, spoken, week: i as WeekIndex })),
	];
}

/** Below this container width the ranked list is the default view. */
const LIST_BELOW = 640;
/** How far the camera pushes toward a node as its drilldown opens. */
const PUSH = 1.3;
const NO_GROUPS: OrbitGroup[] = [];

function stageHeight(width: number): number {
	if (width >= 1024) return 470;
	if (width >= 768) return 450;
	if (width >= LIST_BELOW) return 420;
	return Math.round(Math.min(420, Math.max(320, width)));
}

// Keyframes can't be scoped, so they carry a prefix; everything else hangs off [data-co].
const STYLES = `
@keyframes co-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes co-bloom { from { opacity: 0; transform: scale(0.6); } 60% { opacity: 1; transform: scale(1.03); } to { opacity: 1; transform: scale(1); } }
@keyframes co-draw { to { stroke-dashoffset: 0; } }
@keyframes co-fade { from { opacity: 0; } }
@keyframes co-ignite { from { opacity: 0; transform: scale(0.97); } }
@keyframes co-comet { from { offset-distance: 0%; opacity: 0; } 8% { opacity: 1; } 85% { opacity: 1; } to { offset-distance: 100%; opacity: 0; } }
@keyframes co-flare { 0% { opacity: 0; transform: scale(0.6); } 12% { opacity: 0.9; } to { opacity: 0; transform: scale(2.4); } }
@keyframes co-dust { 0% { opacity: 0; transform: none; } 15% { opacity: 1; } to { opacity: 0; transform: translate(var(--dx), var(--dy)); } }
@keyframes co-dolly { from { transform: scale(1.12); } }
[data-co] .co-entrance { animation: co-rise 320ms ${EASE} backwards; animation-delay: calc(var(--i, 0) * 55ms + 60ms); }
[data-co] .co-bloom { animation: co-bloom ${BLOOM_MS}ms ${EASE} both; }
[data-co] .co-fade { animation: co-fade 360ms ${EASE} backwards; }
[data-co] .co-draw-on { stroke-dasharray: 1; stroke-dashoffset: 1; animation: co-draw ${BEAM_MS}ms ${EASE} forwards; animation-delay: var(--draw-delay, 380ms); }
[data-co] .co-comet { offset-rotate: auto; animation: co-comet ${BEAM_MS}ms ${EASE} both; }
[data-co] .co-flare { animation: co-flare 700ms ${EASE} both; }
[data-co] .co-dust { animation: co-dust 1100ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }
[data-co] .co-dolly { animation: co-dolly 1600ms ${EASE} backwards; }
[data-co][data-intro="off"] :is(.co-entrance, .co-bloom, .co-fade, .co-dolly) { animation: none; }
[data-co][data-intro="off"] .co-draw-on { animation-duration: 1ms; animation-delay: 0ms; }
[data-co][data-hold] * { animation-play-state: paused; }
[data-co][data-paused] :is(.animate-pulse, .co-flare) { animation-play-state: paused; }
[data-co] .orbit-halo { paint-order: stroke; stroke-linejoin: round; stroke-width: 3.5px; stroke: var(--orbit-halo); }
@media (prefers-reduced-motion: reduce) {
	[data-co] *, [data-co] *::before, [data-co] *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; transition-delay: 0ms !important; }
}
`;

export interface VisualizerProps {
	/** Ring-2 nodes. The top 24 by count are shown. */
	nodes: OrbitNodeData[];
	/** Ring-1 groups, in ring order. Omit to derive them from the nodes. */
	groups?: OrbitGroup[];
	/** Every word it says; defaults to agents around an orchestrator. */
	vocab?: OrbitVocab;
	className?: string;
	/** View on wide stages; below 640px the list is always the default. */
	defaultView?: "constellation" | "list";
	/** Show the W1–W4 period toggle. */
	showPeriods?: boolean;
	/** Cap on ring-2 nodes. */
	maxNodes?: number;
	/** Sparks on the beams, twinkling stars and the pulsing sun. */
	ambient?: boolean;
	/** Multiplies how fast sparks travel. */
	sparkSpeed?: number;
	/** Play the staggered entrance the first time the widget is on screen. */
	ignition?: boolean;
	/** Show the legend and keyboard hint under the stage. */
	showLegend?: boolean;
	/** Show the name on the sun. */
	showSunLabel?: boolean;
	sunLabelColor?: string;
	/** Sun, beams, tool orbs, the blocked chip. */
	accent?: string;
	/** Filaments, focus rings, the flag dot. */
	filament?: string;
	agentColor?: string;
	toolColor?: string;
	/** Groups alternate between these two. */
	groupColorA?: string;
	groupColorB?: string;
	/** Freeze ambient motion in place. */
	paused?: boolean;
	/** Skip the entrance and every ambient loop. */
	reducedMotion?: boolean;
}

/**
 * Relationship constellation: a sun at the centre, groups on ring 1, the busiest
 * nodes on ring 2. Select a node to glide it into a drilldown.
 */
export default function Visualizer({
	nodes: nodesIn,
	groups = NO_GROUPS,
	vocab = AGENT_VOCAB,
	className,
	defaultView = "constellation",
	showPeriods = true,
	maxNodes = 24,
	ambient: ambientOn = true,
	sparkSpeed = 1,
	ignition = true,
	showLegend = true,
	showSunLabel = true,
	sunLabelColor = "#1a1408",
	accent = "#e6c27a",
	filament = "#5ee1d9",
	agentColor = "#5fd3a6",
	toolColor = "#e6c27a",
	groupColorA = "#f08bb0",
	groupColorB = "#a99bff",
	paused = false,
	reducedMotion = false,
}: VisualizerProps): React.JSX.Element {
	const rootRef = React.useRef<HTMLDivElement>(null);
	const width = useContainerWidth(rootRef);
	const now = useNow();
	const { inView, seen, known } = useInView(rootRef);
	// Only hold the ignition when we positively know the widget mounted off screen.
	const held = known && !seen;
	const pageVisible = usePageVisible();

	const cap = Math.max(1, Math.min(MAX_SENDERS, Math.round(maxNodes)));
	const senders = React.useMemo(() => normalizeSenders(nodesIn).slice(0, cap), [nodesIn, cap]);
	const byId = React.useMemo(() => new Map(senders.map((s) => [s.id, s])), [senders]);
	const allShares = React.useMemo(() => categoryShares(senders, groups, null), [senders, groups]);
	const period = showPeriods ? vocab.period : null;
	const options = React.useMemo(() => weekOptions(period), [period]);
	const total = allShares.reduce((a, c) => a + c.count, 0);
	const railDaily = React.useMemo(() => combinedDaily(senders), [senders]);

	const [weekKey, setWeekKey] = React.useState<WeekKey>("all");
	const week = (options.find((o) => o.key === weekKey) ?? options[0]!).week;
	const [userView, setUserView] = React.useState<View | null>(null);
	React.useEffect(() => setUserView(null), [defaultView]);
	const view: View = userView ?? (width > 0 && width < LIST_BELOW ? "list" : defaultView);

	const [focusId, setFocusId] = React.useState<string | null>(null);
	const [activeId, setActiveId] = React.useState<string | null>(null);
	const [hoverId, setHoverId] = React.useState<string | null>(null);
	const [keyFocusId, setKeyFocusId] = React.useState<string | null>(null);
	const [announcement, setAnnouncement] = React.useState("");
	const [settled, setSettled] = React.useState(false);
	const introDone = settled || !ignition || reducedMotion;
	// Orbs glide only while focusing/unfocusing, so resizes don't drag them behind their links.
	const [glide, setGlide] = React.useState(0);
	const [glideDone, setGlideDone] = React.useState(0);
	const restoreRef = React.useRef<string | null>(null);

	const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const ids = React.useMemo(() => makeOrbitIds(uid), [uid]);

	const stageH = stageHeight(width);
	const layout = React.useMemo(
		() => (width > 0 && senders.length ? layoutOrbit(senders, groups, width, stageH, week) : null),
		[senders, groups, width, stageH, week],
	);
	const groupLabel = (id: string) => layout?.categories.find((c) => c.id === id)?.label ?? groups.find((g) => g.id === id)?.label ?? id;

	const focusSender = focusId ? byId.get(focusId) : undefined;
	// "View all" swaps the drilldown for the domain's full view of the focused node.
	const [expanded, setExpanded] = React.useState(false);
	const expandedView = expanded && focusSender && vocab.expand ? vocab.expand : null;
	const focusIds = React.useMemo(
		() => (focusSender ? vocab.focus.cards(focusSender, now).map((c) => c.id) : []),
		[focusSender, vocab, now],
	);
	const focusGeom = React.useMemo(
		() => (focusSender && width > 0 ? layoutFocus(width, stageH, focusIds) : null),
		[focusSender, width, stageH, focusIds],
	);
	// The expanded view flows at its own height, like the compact drilldown.
	const compactFocus = expandedView ? true : (focusGeom?.compact ?? false);
	// The camera pushes in around the node that was opened, and pulls back out
	// around the same point, so the origin outlives the focus.
	const [pushId, setPushId] = React.useState<string | null>(null);
	const pushNode = pushId ? layout?.senders.find((s) => s.id === pushId) : undefined;
	const push = reducedMotion || !pushNode ? 1 : PUSH;
	// Inside the pushed layer, aim short so the orb still lands on the drilldown's ring on screen.
	const sceneFocus: SceneFocus =
		focusSender && focusGeom && !compactFocus && view === "constellation"
			? {
					id: focusSender.id,
					x: pushNode ? pushNode.x + (focusGeom.orb.x - pushNode.x) / push : focusGeom.orb.x,
					y: pushNode ? pushNode.y + (focusGeom.orb.y - pushNode.y) / push : focusGeom.orb.y,
					r: focusGeom.orb.r / push,
				}
			: null;

	const constellationReady = layout !== null && view === "constellation" && !held;
	React.useEffect(() => {
		if (!constellationReady || introDone) return;
		const t = window.setTimeout(() => setSettled(true), IGNITION_MS);
		return () => window.clearTimeout(t);
	}, [constellationReady, introDone]);

	React.useEffect(() => {
		if (glide === glideDone) return;
		const t = window.setTimeout(() => setGlideDone(glide), 760);
		return () => window.clearTimeout(t);
	}, [glide, glideDone]);

	const ambient = ambientOn && introDone && !reducedMotion && inView && pageVisible && view === "constellation" && !focusSender;
	const igniting = !introDone && !held;
	const gliding = glide !== glideDone;

	const legendCounts = React.useMemo(() => {
		const agents = senders.filter((s) => s.kind === "agent").length;
		return { agents, tools: senders.length - agents, flagged: senders.filter((s) => s.flagged > 0).length };
	}, [senders]);
	const tabStop = activeId && byId.has(activeId) ? activeId : (senders[0]?.id ?? null);

	// Return focus to the orb (or row) the drilldown was opened from.
	React.useEffect(() => {
		if (focusId !== null || !restoreRef.current) return;
		const id = CSS.escape(restoreRef.current);
		restoreRef.current = null;
		rootRef.current
			?.querySelector<HTMLElement | SVGElement>(`[data-orbit-sender="${id}"], [data-orbit-row="${id}"]`)
			?.focus({ preventScroll: true });
	}, [focusId]);

	const open = React.useCallback(
		(id: string) => {
			const s = byId.get(id);
			if (!s) return;
			setSettled(true);
			setHoverId(null);
			setKeyFocusId(null);
			setActiveId(id);
			setFocusId(id);
			setPushId(id);
			setExpanded(false);
			setGlide((g) => g + 1);
			setAnnouncement(`${displayName(s)}: ${vocab.describe(s, now)}. Press Escape to go back.`);
		},
		[byId, now, vocab],
	);

	const back = React.useCallback(() => {
		restoreRef.current = focusId;
		setFocusId(null);
		setExpanded(false);
		setGlide((g) => g + 1);
		setAnnouncement(`Back to the ${view === "list" ? "list" : "constellation"}.`);
	}, [focusId, view]);

	const ringOrder = React.useMemo(
		() => (layout ? [...layout.senders].sort((a, b) => a.ring - b.ring).map((s) => s.id) : []),
		[layout],
	);

	const navigate = React.useCallback(
		(id: string, key: string) => {
			const n = ringOrder.length;
			if (!n) return;
			const i = Math.max(0, ringOrder.indexOf(id));
			let next = id;
			if (key === "ArrowRight" || key === "ArrowDown") next = ringOrder[(i + 1) % n]!;
			else if (key === "ArrowLeft" || key === "ArrowUp") next = ringOrder[(i - 1 + n) % n]!;
			else if (key === "Home") next = senders[0]!.id;
			else if (key === "End") next = senders[senders.length - 1]!.id;
			setActiveId(next);
			rootRef.current
				?.querySelector<SVGElement>(`[data-orbit-sender="${CSS.escape(next)}"]`)
				?.focus({ preventScroll: true });
		},
		[ringOrder, senders],
	);

	const labels = layout?.categories;
	const ariaLabelFor = React.useCallback(
		(node: OrbitSender) => {
			const s = byId.get(node.id);
			if (!s) return node.id;
			const amount = plural(node.value, vocab.unit[0], vocab.unit[1]);
			const parts = [
				displayName(s),
				week === null ? amount : `${amount} in ${vocab.window.week(week)}`,
				`${formatCount(s.flagged)} ${vocab.flag.label}`,
			];
			if (now !== null) parts.push(vocab.recencyLong(s, now));
			parts.push(labels?.find((c) => c.id === node.category)?.label ?? s.group);
			return parts.join(", ");
		},
		[byId, week, now, vocab, labels],
	);

	const onWeek = (next: string) => {
		const option = options.find((o) => o.key === next);
		if (!option) return;
		setWeekKey(option.key);
		const lead = [...categoryShares(senders, groups, option.week)].sort((a, b) => b.value - a.value)[0];
		setAnnouncement(`${option.spoken}.${lead && lead.value > 0 ? ` ${lead.label} leads with ${lead.text}.` : ""}`);
	};

	const onView = (next: string) => {
		const v = next as View;
		if (v === view) return;
		setSettled(true);
		setUserView(v);
		setFocusId(null);
		setExpanded(false);
		setHoverId(null);
		setAnnouncement(v === "list" ? "List view." : "Constellation view.");
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape" && focusSender) {
			e.preventDefault();
			e.stopPropagation();
			if (expandedView) setExpanded(false);
			else back();
		}
	};

	const fixedStage = width > 0 && ((view === "constellation" && !compactFocus) || (focusSender && !compactFocus));

	return (
		<div
			ref={rootRef}
			data-co=""
			data-intro={introDone ? "off" : undefined}
			data-hold={held && !introDone ? "" : undefined}
			data-paused={paused ? "" : undefined}
			onKeyDown={onKeyDown}
			className={cn("relative min-w-0 text-ink [--orbit-halo:var(--sg-panel)]", className)}
			style={
				{
					"--orbit-sun-paint": `url(#${ids.sun})`,
					"--co-accent": accent,
					"--co-filament": filament,
					"--co-agent": agentColor,
					"--co-tool": toolColor,
					"--co-cat-0": groupColorA,
					"--co-cat-1": groupColorB,
					"--co-sun-label": sunLabelColor,
				} as React.CSSProperties
			}
		>
			<style href="visualizer" precedence="default">
				{STYLES}
			</style>
			{senders.length > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
					<p className={cn(READOUT, "tabular-nums")}>
						{formatCount(total)} {vocab.unit[1]} · {plural(senders.length, vocab.node[0], vocab.node[1])} ·{" "}
						{plural(allShares.length, vocab.group[0], vocab.group[1])}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Segmented
							label="View"
							value={view}
							onChange={onView}
							options={[
								{
									value: "constellation",
									spoken: "Constellation",
									label: (
										<>
											<OrbitIcon className="size-3.5" />
											<span className="hidden sm:inline">Constellation</span>
										</>
									),
								},
								{
									value: "list",
									spoken: "List",
									label: (
										<>
											<ListIcon className="size-3.5" />
											<span className="hidden sm:inline">List</span>
										</>
									),
								},
							]}
						/>
					</div>
				</div>
			)}

			{period && senders.length > 0 && (
				<TimeRail
					daily={railDaily}
					options={options}
					value={weekKey}
					onChange={onWeek}
					inert={focusSender ? true : undefined}
					className={cn("mt-3 transition-opacity", focusSender && "opacity-0")}
				/>
			)}

			{senders.length === 0 ? (
				<EmptyOrbit vocab={vocab} sunLabel={showSunLabel} />
			) : width === 0 ? (
				<div className="mt-4 h-[360px] sm:h-[470px]" aria-hidden />
			) : (
				// One grid cell holds the live view plus invisible stand-ins for the other
				// view, so the card is always as tall as the taller of the two and
				// switching views (or opening a node) never resizes it.
				<div className="mt-4 grid *:[grid-area:1/1]">
					<div className="flex min-w-0 flex-col justify-center">
						<div
							className={cn("relative", focusSender && "overflow-clip")}
							style={fixedStage ? { height: stageH } : undefined}
						>
							{view === "constellation" && layout && !(focusSender && compactFocus) && (
								<div
									inert={focusSender ? true : undefined}
									className="absolute inset-0"
									style={{
										transform: focusSender && push !== 1 ? `scale(${push})` : undefined,
										transformOrigin: pushNode ? `${pushNode.x}px ${pushNode.y}px` : undefined,
										transition: gliding ? `transform 640ms ${EASE}` : undefined,
										willChange: gliding ? "transform" : undefined,
									}}
								>
									<OrbitScene
										layout={layout}
										senders={byId}
										ids={ids}
										focus={sceneFocus}
										activeId={tabStop}
										hoverId={hoverId}
										tipId={hoverId ?? keyFocusId}
										ambient={ambient}
										igniting={igniting}
										paused={paused}
										sparkSpeed={Math.max(0.05, sparkSpeed)}
										sunLabel={showSunLabel}
										gliding={gliding}
										now={now}
										vocab={vocab}
										ariaLabelFor={ariaLabelFor}
										onHover={setHoverId}
										onFocusNode={setKeyFocusId}
										onActivate={open}
										onNavigate={navigate}
									/>
								</div>
							)}
							{view === "list" && layout && !focusSender && (
								<OrbitList senders={senders} categories={layout.categories} week={week} now={now} vocab={vocab} onOpen={open} />
							)}
							{focusSender && expandedView && (
								<section key={focusSender.id} aria-label={`${displayName(focusSender)} details`} className="flex flex-col gap-4">
									<BackButton returnTo={displayName(focusSender)} onBack={() => setExpanded(false)} />
									{expandedView.render(focusSender)}
								</section>
							)}
							{focusSender && focusGeom && !expandedView && (
								<Drilldown
									key={focusSender.id}
									sender={focusSender}
									group={groupLabel(focusSender.group)}
									focus={vocab.focus}
									more={vocab.expand ? { label: vocab.expand.label(focusSender), onClick: () => setExpanded(true) } : undefined}
									geom={focusGeom}
									showOrb={view === "list" || compactFocus}
									now={now}
									reduced={reducedMotion}
									returnTo={view === "list" ? "list" : "constellation"}
									onBack={back}
									onAnnounce={setAnnouncement}
								/>
							)}
						</div>
						{showLegend && view === "constellation" && !(focusSender && compactFocus) && (
							// Kept (invisible) under a drilldown so the card holds its height.
							<Legend vocab={vocab} counts={legendCounts} hidden={!!focusSender} />
						)}
					</div>
					{(view !== "list" || focusSender) && layout && (
						<div aria-hidden inert className="invisible min-w-0">
							<OrbitList senders={senders} categories={layout.categories} week={week} now={now} vocab={vocab} onOpen={() => {}} />
						</div>
					)}
					<div aria-hidden inert className="invisible flex min-w-0 flex-col">
						<div style={{ height: stageH }} />
						{showLegend && <Legend vocab={vocab} counts={legendCounts} hidden />}
					</div>
				</div>
			)}

			<p id={ids.hint} className="sr-only">
				{vocab.srHint}
			</p>
			<p aria-live="polite" className="sr-only">
				{announcement}
			</p>
		</div>
	);
}

function Legend({
	vocab,
	counts,
	hidden,
}: {
	vocab: OrbitVocab;
	counts: { agents: number; tools: number; flagged: number };
	hidden: boolean;
}) {
	return (
		<div
			aria-hidden={hidden || undefined}
			className={cn("mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12px] text-ink-dim", hidden && "invisible")}
		>
			<ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
				<li className="inline-flex items-center gap-1.5">
					<span className="size-2.5 rounded-full bg-(--co-agent)" />
					{vocab.legend.person}
					<LegendCount n={counts.agents} />
				</li>
				<li className="inline-flex items-center gap-1.5">
					<span className="size-2.5 rounded-full bg-(--co-tool)" />
					{vocab.legend.machine}
					<LegendCount n={counts.tools} />
				</li>
				<li className="inline-flex items-center gap-1.5">
					<span className="size-1.5 rounded-full bg-(--co-filament)" />
					{capitalize(vocab.flag.label)}
					<LegendCount n={counts.flagged} />
				</li>
				<li className="inline-flex items-center gap-1.5">
					<span aria-hidden className="h-2.5 w-px bg-(--co-accent)" />
					{vocab.legend.ring}
				</li>
			</ul>
			<p className="hidden items-center gap-1.5 lg:inline-flex">
				{vocab.legend.hint} · <Kbd>←</Kbd>
				<Kbd>→</Kbd> to move · <Kbd>Esc</Kbd> to return
			</p>
		</div>
	);
}

function LegendCount({ n }: { n: number }) {
	return <span className="font-mono text-[11px] text-ink-mute tabular-nums">{formatCount(n)}</span>;
}

function EmptyOrbit({ vocab, sunLabel }: { vocab: OrbitVocab; sunLabel: boolean }) {
	return (
		<div className="flex flex-col items-center gap-5 py-10 text-center">
			<svg width="168" height="168" viewBox="0 0 168 168" aria-hidden>
				<circle cx="84" cy="84" r="80" fill="none" strokeWidth={1} strokeDasharray="1 7" strokeLinecap="round" className="stroke-hairline" />
				<circle cx="84" cy="84" r="52" fill="none" strokeWidth={1} className="stroke-hairline" />
				<circle cx="84" cy="84" r="27" className="fill-(--co-accent)/10" />
				<circle cx="84" cy="84" r="18" className="fill-(--co-accent)" />
				{sunLabel && (
					<text x="84" y="84" textAnchor="middle" dominantBaseline="central" className="fill-(--co-sun-label) text-[7px] font-semibold">
						{vocab.sun}
					</text>
				)}
			</svg>
			<div>
				<p className="text-[17px] text-ink">{vocab.empty.title}</p>
				<p className="mx-auto mt-1 max-w-[340px] text-[13px] text-ink-dim">{vocab.empty.body}</p>
			</div>
		</div>
	);
}
