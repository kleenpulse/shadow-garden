"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { cn } from "@/lib/utils";
import {
	ROW_GAP,
	ROW_H,
	ROWS_HEADER,
	activityTicks,
	arcOffsets,
	fanCurve,
	panelTop,
	stackRows,
	ticksPath,
	type FocusCardId,
	type FocusLayout,
} from "./layout";
import { displayName, formatCount, READOUT } from "./format";
import { EASE, arriveAt } from "./motion";
import type { OrbitNodeData } from "./types";
import type { FocusCardSpec, OrbitFocus } from "./vocab";

/** Orb → card curves, then card → row fan. Cards and rows appear as their spark lands. */
const CURVE = { delay: 420, stagger: 70, dur: 620 };
const FAN = { delay: 760, stagger: 60, dur: 560 };
const cardArrive = (i: number) => arriveAt(CURVE.delay + i * CURVE.stagger, CURVE.dur);
const rowArrive = (i: number) => arriveAt(FAN.delay + i * FAN.stagger, FAN.dur);

type Card = FocusCardSpec;

type DrilldownProps = {
	sender: OrbitNodeData;
	/** Label of the group the node orbits. */
	group: string;
	focus: OrbitFocus;
	/** "View all" under the rows. */
	more?: { label: string; onClick: () => void };
	geom: FocusLayout;
	/** Draw our own orb (list view, or compact stages where the scene is hidden). */
	showOrb: boolean;
	now: number | null;
	reduced: boolean;
	returnTo: string;
	onBack: () => void;
	onAnnounce: (message: string) => void;
};

/** Takes focus on mount so Escape/Enter keep working after a drilldown opens. */
export function BackButton({ returnTo, onBack }: { returnTo: string; onBack: () => void }) {
	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		ref.current?.focus({ preventScroll: true });
	}, []);
	return (
		<div className="flex items-center gap-2.5">
			<button
				ref={ref}
				type="button"
				onClick={onBack}
				className="inline-flex h-9 items-center gap-2 rounded-full bg-raised pr-4 pl-3 text-[13px] text-ink ring-1 ring-hairline transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-(--co-filament)/60 focus-visible:outline-none"
			>
				<ArrowLeft className="size-4" />
				Back to {returnTo}
			</button>
			<span className="hidden items-center gap-1.5 text-[11.5px] text-ink-dim sm:inline-flex">
				<Kbd>Esc</Kbd>
			</span>
		</div>
	);
}

export function Drilldown({ sender, group, focus, more, geom, showOrb, now, reduced, returnTo, onBack, onAnnounce }: DrilldownProps) {
	const cards = React.useMemo(() => focus.cards(sender, now), [focus, sender, now]);
	const rowsId = cards[0]?.id ?? "rows";
	const rows = React.useMemo(() => focus.rows(sender, now).slice(0, 5), [focus, sender, now]);
	const [selected, setSelected] = React.useState<FocusCardId>(rowsId);
	const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const role = sender.kind === "agent" ? "agent" : "tool";

	const select = (id: FocusCardId) => {
		setSelected(id);
		const card = cards.find((c) => c.id === id);
		if (card) onAnnounce(`${card.label}: ${card.value}.`);
	};

	const style = {
		["--node" as string]: `var(--co-${role})`,
		["--node-gloss" as string]: `url(#${uid}-gloss)`,
	} as React.CSSProperties;

	const back = <BackButton returnTo={returnTo} onBack={onBack} />;

	if (geom.compact) {
		return (
			<section aria-label={`${displayName(sender)} details`} className="flex flex-col gap-4" style={style}>
				{back}
				<div className="flex items-center gap-4">
					<svg width={geom.height} height={geom.height} className="shrink-0 overflow-visible" aria-hidden>
						<FocusDefs uid={uid} />
						<ActivityRing sender={sender} geom={geom} uid={uid} showOrb reduced={reduced} />
					</svg>
					<Identity sender={sender} className="min-w-0 text-left" />
				</div>
				<div className="grid grid-cols-2 gap-2">
					{cards.map((card, i) => (
						<StatCard
							key={card.id}
							card={card}
							selected={selected === card.id}
							onSelect={select}
							reduced={reduced}
							delay={200 + i * 50}
							compact
							className={cn("h-[60px]", cards.length % 2 === 1 && i === cards.length - 1 && "col-span-2")}
						/>
					))}
				</div>
				<Detail focus={focus} sender={sender} selected={selected} rowsId={rowsId} rows={rows} more={more} now={now} reduced={reduced} compact />
			</section>
		);
	}

	const selectedCard = geom.cards.find((c) => c.id === selected) ?? geom.cards[0]!;
	// The "View all" button takes one row slot so the stack stays inside the stage.
	const stack = stackRows(geom.detail, rows.length + (more ? 1 : 0));
	const from = { x: selectedCard.x + selectedCard.w + 2, y: selectedCard.cy };
	const panelY = panelTop(geom.detail, selectedCard.cy, focus.panelHeight[selected] ?? 240);
	// Rows bow along an arc around the middle of the stack, so the fan lands on a curve.
	const span = (stack.centers.at(-1) ?? 0) - (stack.centers[0] ?? 0);
	const offsets = arcOffsets(stack.centers, (stack.centers[0]! + stack.centers.at(-1)!) / 2, Math.max(1, span * 1.1));
	const rowEnds = stack.centers.slice(0, rows.length).map((y, i) => ({ x: geom.detail.x - 4 + (offsets[i] ?? 0), y }));
	const detailCurves =
		selected === rowsId
			? rowEnds.map((to) => fanCurve(from, to))
			: [fanCurve(from, { x: geom.detail.x - 4, y: panelY + 28 })];
	const { orb } = geom;

	return (
		<section aria-label={`${displayName(sender)} details`} className="absolute inset-0" style={style}>
			<svg width={geom.width} height={geom.height} className="pointer-events-none absolute inset-0" aria-hidden>
				<FocusDefs uid={uid} />
				{/* The orbit, remembered: a faint ring 2 echo sweeping behind the cards. */}
				<ellipse
					cx={orb.x}
					cy={orb.y}
					rx={geom.detail.x + geom.detail.w * 0.55 - orb.x}
					ry={geom.height * 0.62}
					fill="none"
					className="stroke-hairline"
					strokeWidth={1}
					strokeDasharray="1 7"
					strokeLinecap="round"
					style={fadeStyle(reduced, 200, 900)}
				/>
				<ActivityRing sender={sender} geom={geom} uid={uid} showOrb={showOrb} reduced={reduced} />
				<g fill="none" strokeLinecap="round">
					{geom.curves.map((d, i) => {
						const on = geom.cards[i]?.id === selected;
						return (
							<path
								key={i}
								d={d}
								pathLength={1}
								className={cn(
									"transition-[stroke,stroke-width] duration-300",
									on ? "stroke-(--co-accent)" : "stroke-ink-mute/60 dark:stroke-(--co-filament)/35",
								)}
								strokeWidth={on ? 1.6 : 1}
								style={drawStyle(reduced, CURVE.delay + i * CURVE.stagger, CURVE.dur)}
							/>
						);
					})}
				</g>
				{geom.cards.map((c, i) => (
					<Port key={c.id} x={c.x - 4} y={c.cy} on={c.id === selected} style={fadeStyle(reduced, cardArrive(i), 240)} />
				))}
				{!reduced && <Sparks paths={geom.curves} delay={CURVE.delay} stagger={CURVE.stagger} dur={CURVE.dur} />}
			</svg>

			<svg
				key={`fan-${selected}`}
				width={geom.width}
				height={geom.height}
				className="pointer-events-none absolute inset-0"
				aria-hidden
			>
				<g fill="none" strokeLinecap="round">
					{detailCurves.map((d, i) => (
						<path
							key={i}
							d={d}
							pathLength={1}
							className="stroke-(--co-accent)/65"
							strokeWidth={1.1}
							style={drawStyle(reduced, FAN.delay + i * FAN.stagger, FAN.dur)}
						/>
					))}
				</g>
				{selected === rowsId &&
					rowEnds.map((p, i) => <Port key={i} x={p.x} y={p.y} on style={fadeStyle(reduced, rowArrive(i), 240)} />)}
				{!reduced && <Sparks paths={detailCurves} delay={FAN.delay} stagger={FAN.stagger} dur={FAN.dur} />}
			</svg>

			<div className="absolute top-0 left-0">{back}</div>

			<Identity
				sender={sender}
				className="absolute w-[260px] -translate-x-1/2 text-center"
				style={{ left: geom.orb.x, top: Math.max(44, geom.orb.y - geom.ring.outer - 66) }}
			/>
			<div
				className="absolute flex -translate-x-1/2 flex-col items-center gap-2"
				style={{ left: geom.orb.x, top: geom.orb.y + geom.ring.outer + 14 }}
			>
				<span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-raised px-2.5 text-[11.5px] text-ink ring-1 ring-hairline">
					<span className="size-1.5 rounded-full bg-(--node)" />
					{focus.chip(sender, group)}
				</span>
				<p className={cn(READOUT, "text-[10px]")}>{focus.ringCaption}</p>
			</div>

			{geom.cards.map((pos, i) => {
				const card = cards.find((c) => c.id === pos.id)!;
				return (
					<StatCard
						key={card.id}
						card={card}
						selected={selected === card.id}
						onSelect={select}
						reduced={reduced}
						delay={cardArrive(i) - 60}
						className="absolute"
						style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
					/>
				);
			})}

			<div
				key={`detail-${selected}`}
				className="absolute"
				style={{
					left: geom.detail.x,
					top: selected === rowsId ? stack.top : panelY,
					width: geom.detail.w,
				}}
			>
				<Detail
					focus={focus}
					sender={sender}
					selected={selected}
					rowsId={rowsId}
					rows={rows}
					more={more}
					now={now}
					reduced={reduced}
					offsets={offsets}
				/>
			</div>
		</section>
	);
}

function drawStyle(reduced: boolean, delay: number, dur: number): React.CSSProperties | undefined {
	if (reduced) return undefined;
	return {
		strokeDasharray: 1,
		strokeDashoffset: 1,
		animation: `co-draw ${dur}ms ${EASE} ${delay}ms forwards`,
	};
}

function riseStyle(reduced: boolean, delay: number): React.CSSProperties | undefined {
	if (reduced) return undefined;
	return { animation: `co-rise 420ms ${EASE} ${delay}ms backwards` };
}

function igniteStyle(reduced: boolean, delay: number): React.CSSProperties | undefined {
	if (reduced) return undefined;
	return { animation: `co-ignite 380ms ${EASE} ${delay}ms backwards` };
}

function fadeStyle(reduced: boolean, delay: number, dur: number): React.CSSProperties | undefined {
	if (reduced) return undefined;
	return { animation: `co-fade ${dur}ms ${EASE} ${delay}ms backwards` };
}

/** The socket a curve plugs into on a card or row edge. */
function Port({ x, y, on, style }: { x: number; y: number; on: boolean; style?: React.CSSProperties }) {
	return (
		<rect
			x={x}
			y={y - 7}
			width={3}
			height={14}
			rx={1.5}
			className={cn("transition-[fill] duration-300", on ? "fill-(--co-accent)" : "fill-ink-mute/50 dark:fill-(--co-filament)/45")}
			style={style}
		/>
	);
}

function FocusDefs({ uid }: { uid: string }) {
	return (
		<defs>
			<radialGradient id={`${uid}-gloss`} cx="0.4" cy="0.36" r="0.72" fx="0.32" fy="0.26">
				<stop offset="0" style={{ stopColor: "color-mix(in oklab, var(--node) 30%, white)" }} />
				<stop offset="0.45" style={{ stopColor: "var(--node)" }} />
				<stop offset="1" style={{ stopColor: "color-mix(in oklab, var(--node) 52%, black)" }} />
			</radialGradient>
			<radialGradient id={`${uid}-halo`}>
				<stop offset="0.3" style={{ stopColor: "var(--node)", stopOpacity: 0 }} />
				<stop offset="0.5" style={{ stopColor: "var(--node)", stopOpacity: 0.16 }} />
				<stop offset="1" style={{ stopColor: "var(--node)", stopOpacity: 0 }} />
			</radialGradient>
		</defs>
	);
}

/** The data-true version of the reference's waveform ring: one tick per day. */
function ActivityRing({
	sender,
	geom,
	uid,
	showOrb,
	reduced,
}: {
	sender: OrbitNodeData;
	geom: FocusLayout;
	uid: string;
	showOrb: boolean;
	reduced: boolean;
}) {
	const { orb, ring } = geom;
	const ticks = activityTicks(sender.daily, orb.x, orb.y, ring.inner, ring.maxLen);
	const d = ticksPath(ticks);
	const busiest = ticks.reduce((best, t) => (t.value > best.value ? t : best), ticks[0] ?? { value: 0, x2: 0, y2: 0 });
	return (
		<g>
			<circle cx={orb.x} cy={orb.y} r={ring.outer + 26} fill={`url(#${uid}-halo)`} className="hidden dark:inline" />
			<circle
				cx={orb.x}
				cy={orb.y}
				r={ring.inner - 3.5}
				fill="none"
				className="stroke-hairline"
				strokeWidth={1}
			/>
			<path
				d={d}
				pathLength={1}
				fill="none"
				strokeLinecap="round"
				strokeWidth={2.4}
				className="stroke-(--node)"
				style={drawStyle(reduced, 260, 900)}
			/>
			{busiest.value > 0 && (
				<circle
					cx={busiest.x2}
					cy={busiest.y2}
					r={2.6}
					className="fill-ink"
					style={riseStyle(reduced, 1100)}
				/>
			)}
			{showOrb && (
				<g className="origin-center [transform-box:fill-box]" style={reduced ? undefined : { animation: `co-bloom 700ms ${EASE} both` }}>
					<circle
						cx={orb.x}
						cy={orb.y}
						r={orb.r}
						strokeWidth={1}
						className={cn(
							"fill-(--node-gloss) stroke-none drop-shadow-[0_0_12px_color-mix(in_oklab,var(--node)_55%,transparent)]",
						)}
					/>
				</g>
			)}
		</g>
	);
}

/** One spark rides each curve as it draws. Fresh <svg> ⇒ SMIL begins at mount. */
function Sparks({ paths, delay, stagger, dur }: { paths: string[]; delay: number; stagger: number; dur: number }) {
	return (
		<g>
			{paths.map((d, i) => {
				const begin = `${(delay + i * stagger) / 1000}s`;
				return (
					<g key={i} opacity={0}>
						<circle r={4} className="fill-(--co-accent)" opacity={0.3} />
						<circle r={1.5} className="fill-[color-mix(in_oklab,var(--co-accent)_22%,white)]" />
						<animateMotion dur={`${dur}ms`} begin={begin} path={d} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.23 1 0.32 1" fill="freeze" />
						<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.75;1" dur={`${dur + 260}ms`} begin={begin} fill="freeze" />
					</g>
				);
			})}
		</g>
	);
}

function Identity({ sender, className, style }: { sender: OrbitNodeData; className?: string; style?: React.CSSProperties }) {
	return (
		<div className={className} style={style}>
			<h3 className="truncate text-[20px] leading-tight tracking-[-0.01em] text-ink">{displayName(sender)}</h3>
			<p className="mt-1 truncate font-mono text-[11.5px] text-ink-dim">{sender.detail}</p>
		</div>
	);
}

function StatCard({
	card,
	selected,
	onSelect,
	reduced,
	delay,
	compact = false,
	className,
	style,
}: {
	card: Card;
	selected: boolean;
	onSelect: (id: FocusCardId) => void;
	reduced: boolean;
	delay: number;
	compact?: boolean;
	className?: string;
	style?: React.CSSProperties;
}) {
	const Icon = card.icon;
	return (
		<button
			type="button"
			data-orbit-card={card.id}
			aria-label={card.spoken.charAt(0).toUpperCase() + card.spoken.slice(1)}
			aria-pressed={selected}
			onClick={() => onSelect(card.id)}
			className={cn(
				"group flex items-center rounded-[16px] text-left transition-[background-color,box-shadow,color] duration-200",
				compact ? "gap-2.5 px-3" : "gap-3 px-3.5",
				"focus-visible:ring-2 focus-visible:ring-(--co-filament)/60 focus-visible:outline-none",
				selected
					? "bg-[linear-gradient(100deg,color-mix(in_oklab,var(--co-accent)_26%,var(--sg-panel)),color-mix(in_oklab,var(--co-accent)_8%,var(--sg-panel))_70%)] text-ink shadow-[inset_0_1px_0_color-mix(in_oklab,white_14%,transparent),0_0_0_1px_color-mix(in_oklab,var(--co-accent)_50%,transparent),0_0_34px_-6px_color-mix(in_oklab,var(--co-accent)_45%,transparent)]"
					: "bg-[linear-gradient(100deg,color-mix(in_oklab,var(--co-filament)_9%,var(--sg-raised)),var(--sg-raised)_55%)] text-ink ring-1 ring-hairline hover:ring-(--co-accent)/35",
				className,
			)}
			style={{ ...style, ...igniteStyle(reduced, delay) }}
		>
			<span
				className={cn(
					"grid shrink-0 place-items-center rounded-full",
					compact ? "size-7" : "size-8",
					selected ? "bg-(--co-accent)/15 text-(--co-accent)" : "bg-panel text-ink-dim",
				)}
			>
				<Icon className="size-4" />
			</span>
			<span className="min-w-0">
				<span className="block truncate text-[20px] leading-none tracking-[-0.02em] tabular-nums">
					<CountUp key={card.value} value={card.value} delay={delay} reduced={reduced} />
				</span>
				<span className={cn("mt-1 block truncate text-[12px]", selected ? "text-ink-dim" : "text-ink-mute")}>{card.label}</span>
			</span>
		</button>
	);
}

/** Plain counts and percentages count up as their card lands; durations and ages don't. */
const COUNTABLE = /^(\d{1,3}(?:,\d{3})*|\d+)(%?)$/;
const COUNT_MS = 700;

function CountUp({ value, delay, reduced }: { value: string; delay: number; reduced: boolean }) {
	const ref = React.useRef<HTMLSpanElement>(null);
	const match = reduced ? null : COUNTABLE.exec(value);
	const target = match ? Number(match[1]!.replaceAll(",", "")) : 0;
	const suffix = match?.[2] ?? "";
	useAnimationLoop({
		target: ref,
		halted: !match,
		paintWhenHalted: false,
		onFrame: ({ elapsed }) => {
			const el = ref.current;
			if (!el) return false;
			const t = Math.min(1, Math.max(0, (elapsed * 1000 - delay) / COUNT_MS));
			// Land on the source string exactly, so what's left on screen is never a rounding of it.
			el.textContent = t >= 1 ? value : `${formatCount(target * (1 - (1 - t) ** 3))}${suffix}`;
			if (t >= 1) return false;
		},
	});
	// Renders the final value, so SSR, no-JS and a skipped count all read true.
	return <span ref={ref}>{value}</span>;
}

function Detail({
	focus,
	sender,
	selected,
	rowsId,
	rows,
	more,
	now,
	reduced,
	offsets,
	compact = false,
}: {
	focus: OrbitFocus;
	sender: OrbitNodeData;
	selected: FocusCardId;
	rowsId: FocusCardId;
	rows: { key: string; node: React.ReactNode }[];
	more?: { label: string; onClick: () => void };
	now: number | null;
	reduced: boolean;
	/** Per-slot x shift that lays the rows (and "View all") along the fan's arc. */
	offsets?: number[];
	compact?: boolean;
}) {
	// `translate`, not `transform`: the entrance animates transform and would override it.
	const shift = (i: number) => (offsets?.[i] ? `${offsets[i]}px 0` : undefined);
	const bow = offsets?.length ? Math.max(0, ...offsets) : 0;
	if (selected === rowsId) {
		const note = focus.rowsNote(sender);
		return (
			<div>
				<div
					className="flex items-center justify-between gap-3"
					style={{ height: ROWS_HEADER, ...riseStyle(reduced, compact ? 200 : rowArrive(0) - 120) }}
				>
					<p className={READOUT}>{focus.rowsTitle(sender)}</p>
					{note && <p className="text-[12px] text-[color-mix(in_oklab,var(--co-accent)_72%,var(--sg-ink))]">{note}</p>}
				</div>
				{rows.length === 0 ? (
					<p className="rounded-[14px] bg-raised px-4 py-3 text-[13px] text-ink-dim ring-1 ring-hairline">
						{focus.emptyRows}
					</p>
				) : (
					// Rows give up the arc's reach on the right, so the furthest one ends flush with the header.
					<ul className="flex flex-col" style={{ gap: ROW_GAP, paddingRight: bow }}>
						{rows.map((row, i) => (
							<li
								key={row.key}
								style={{ height: ROW_H, translate: shift(i), ...riseStyle(reduced, compact ? 260 + i * 60 : rowArrive(i) - 40) }}
							>
								{row.node}
							</li>
						))}
					</ul>
				)}
				{more && (
					<button
						type="button"
						onClick={more.onClick}
						className="group mt-2 inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] text-ink-dim ring-1 ring-hairline transition-colors hover:text-ink hover:ring-(--co-accent)/40 focus-visible:ring-2 focus-visible:ring-(--co-filament)/60 focus-visible:outline-none"
						style={{
							translate: shift(rows.length),
							...riseStyle(reduced, compact ? 260 + rows.length * 60 : rowArrive(rows.length) - 40),
						}}
					>
						{more.label}
						<ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
					</button>
				)}
			</div>
		);
	}

	return (
		<div
			className="rounded-[20px] border border-hairline bg-panel/80 p-5 text-ink shadow-[0_26px_50px_-24px_rgb(0_0_0/0.6)] backdrop-blur-md"
			style={riseStyle(reduced, compact ? 120 : rowArrive(0) - 40)}
		>
			{focus.panel(sender, selected, now)}
		</div>
	);
}

export function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-hairline bg-raised px-1.5 font-mono text-[10.5px] text-ink-dim">
			{children}
		</kbd>
	);
}
