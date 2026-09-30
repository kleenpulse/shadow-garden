"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CHIP_H, textWidth, type OrbitCategory, type OrbitLayout, type OrbitSender } from "./layout";
import { displayName, formatCount } from "./format";
import { EASE, beamArrive, beamStart, seeded, senderStart } from "./motion";
import type { OrbitNodeData } from "./types";
import type { OrbitVocab } from "./vocab";

export type OrbitIds = {
	sun: string;
	sunGlow: string;
	wash: string;
	glow: string;
	gloss: (key: "person" | "machine" | "cat-0" | "cat-1") => string;
	beam: (i: number) => string;
	hint: string;
};

export function makeOrbitIds(uid: string): OrbitIds {
	return {
		sun: `${uid}-sun`,
		sunGlow: `${uid}-sun-glow`,
		wash: `${uid}-wash`,
		glow: `${uid}-glow`,
		gloss: (key) => `${uid}-gloss-${key}`,
		beam: (i) => `${uid}-beam-${i}`,
		hint: `${uid}-hint`,
	};
}

const stageSeed = (width: number, height: number) => Math.imul(width, 73856093) ^ Math.imul(height, 19349663);

/** Deterministic starfield for the dark theme (seeded by stage size). */
function stars(width: number, height: number) {
	const rand = seeded(stageSeed(width, height));
	const count = Math.round(clampNum((width * height) / 9000, 18, 64));
	return Array.from({ length: count }, (_, i) => ({
		x: Math.round(rand() * width * 10) / 10,
		y: Math.round(rand() * height * 10) / 10,
		r: 0.45 + rand() * 0.8,
		o: 0.18 + rand() * 0.4,
		twinkle: i % 9 === 0,
		dur: 2.6 + rand() * 3.2,
	}));
}

function clampNum(v: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, v));
}

/** Gold dust thrown off the sun at ignition: one radial offset per mote. */
function dust(width: number, height: number, reach: number) {
	const rand = seeded(stageSeed(width, height) ^ 0x5bd1e995);
	return Array.from({ length: 28 }, (_, i) => {
		const a = ((i + rand() * 0.8) / 28) * Math.PI * 2;
		const d = reach * (0.6 + rand() * 0.8);
		return {
			dx: Math.round(Math.cos(a) * d),
			dy: Math.round(Math.sin(a) * d),
			size: 1.5 + rand() * 1.5,
			delay: Math.round(80 + rand() * 140),
		};
	});
}

function Gloss({ id, color }: { id: string; color: string }) {
	return (
		<radialGradient id={id} cx="0.4" cy="0.36" r="0.72" fx="0.32" fy="0.26">
			<stop offset="0" style={{ stopColor: `color-mix(in oklab, ${color} 30%, white)` }} />
			<stop offset="0.45" style={{ stopColor: color }} />
			<stop offset="1" style={{ stopColor: `color-mix(in oklab, ${color} 52%, black)` }} />
		</radialGradient>
	);
}

export type SceneFocus = { id: string; x: number; y: number; r: number } | null;

type SceneProps = {
	layout: OrbitLayout;
	senders: Map<string, OrbitNodeData>;
	ids: OrbitIds;
	focus: SceneFocus;
	activeId: string | null;
	hoverId: string | null;
	tipId: string | null;
	ambient: boolean;
	/** The one-shot entrance is playing: comets, arrival flashes, dust. */
	igniting: boolean;
	/** Freeze ambient motion in place rather than removing it. */
	paused: boolean;
	/** Multiplies spark speed along the beams. */
	sparkSpeed: number;
	/** Draw the vocab.sun label on the sun. */
	sunLabel: boolean;
	/** A focus/unfocus glide is running; otherwise orbs snap (e.g. on resize). */
	gliding: boolean;
	now: number | null;
	vocab: OrbitVocab;
	ariaLabelFor: (s: OrbitSender) => string;
	onHover: (id: string | null) => void;
	onFocusNode: (id: string | null) => void;
	onActivate: (id: string) => void;
	onNavigate: (id: string, key: string) => void;
};

const NAV_KEYS = new Set(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"]);

export const OrbitScene = React.memo(function OrbitScene({
	layout,
	senders,
	ids,
	focus,
	activeId,
	hoverId,
	tipId,
	ambient,
	igniting,
	paused,
	sparkSpeed,
	sunLabel,
	gliding,
	now,
	vocab,
	ariaLabelFor,
	onHover,
	onFocusNode,
	onActivate,
	onNavigate,
}: SceneProps) {
	const { width, height, cx, cy, sun, rings, categories } = layout;
	const focused = focus !== null;
	const field = React.useMemo(() => stars(width, height), [width, height]);
	const hovered = hoverId ? layout.senders.find((s) => s.id === hoverId) : undefined;
	const fade = { opacity: focused ? 0 : 1, transition: `opacity 320ms ${EASE}` };
	// Fit the label inside the sun rather than letting a long name spill onto the tick ring.
	const sunFont = clampNum((sun.r * 1.75) / Math.max(1, textWidth(vocab.sun, 1)), 7, 11);
	const glowR = sun.ringInner + sun.ringMax + clampNum(layout.scale * 0.09, 24, 48);
	const motes = React.useMemo(() => dust(width, height, glowR * 1.6), [width, height, glowR]);

	// Each group lights when its beam lands; its nodes follow in ring order.
	const arrive = React.useMemo(() => new Map(categories.map((c) => [c.id, beamArrive(c.order)])), [categories]);
	const senderDelay = React.useMemo(() => {
		const seen = new Map<string, number>();
		const out = new Map<string, number>();
		for (const s of [...layout.senders].sort((a, b) => a.ring - b.ring)) {
			const k = seen.get(s.category) ?? 0;
			seen.set(s.category, k + 1);
			out.set(s.id, senderStart(arrive.get(s.category) ?? 0, k));
		}
		return out;
	}, [layout.senders, arrive]);

	// A node is live while its latest run is still going.
	const live = React.useMemo(
		() => layout.senders.filter((s) => senders.get(s.id)?.recent[0]?.status === "running"),
		[layout.senders, senders],
	);

	// Starfield parallax: written straight to a CSS var, never through React state.
	const starsRef = React.useRef<HTMLDivElement>(null);
	const drift = ambient && !paused;
	const setDrift = (x: number, y: number) => {
		starsRef.current?.style.setProperty("--co-px", `${x.toFixed(2)}px`);
		starsRef.current?.style.setProperty("--co-py", `${y.toFixed(2)}px`);
	};
	React.useEffect(() => {
		if (!drift) setDrift(0, 0);
	}, [drift]);

	return (
		<div
			className="co-dolly absolute inset-0"
			style={{ transformOrigin: `${cx}px ${cy}px` }}
			onPointerMove={(e) => {
				if (!drift || e.pointerType !== "mouse") return;
				const box = e.currentTarget.getBoundingClientRect();
				const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
				const ny = ((e.clientY - box.top) / box.height) * 2 - 1;
				setDrift(-nx * 8, -ny * 8);
			}}
			onPointerLeave={() => setDrift(0, 0)}
		>
			{/*
			 * Ambient motion lives in HTML layers around the SVG so it never repaints the
			 * filtered scene. Stars are `hidden dark:block`: CSS animations stop under
			 * display:none, so the light theme pays nothing for them.
			 */}
			<div aria-hidden className="pointer-events-none absolute inset-0" style={fade}>
				<div
					ref={starsRef}
					className="absolute inset-0"
					style={{ transform: "translate3d(var(--co-px, 0px), var(--co-py, 0px), 0)", transition: "transform 600ms ease-out" }}
				>
					<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 hidden dark:block">
						<defs>
							<radialGradient id={ids.wash}>
								<stop offset="0" style={{ stopColor: "var(--co-filament)", stopOpacity: 0.07 }} />
								<stop offset="1" style={{ stopColor: "var(--co-filament)", stopOpacity: 0 }} />
							</radialGradient>
						</defs>
						<ellipse cx={cx} cy={cy} rx={rings.r2.rx + 90} ry={rings.r2.ry + 70} fill={`url(#${ids.wash})`} />
						{[false, true].map((bright) => (
							<path
								key={String(bright)}
								d={field
									.filter((s) => !s.twinkle && s.o > 0.38 === bright)
									.map((s) => `M${s.x} ${s.y}h0`)
									.join("")}
								className="stroke-ink"
								strokeOpacity={bright ? 0.42 : 0.2}
								strokeWidth={bright ? 1.6 : 1.1}
								strokeLinecap="round"
							/>
						))}
					</svg>
					{field
						.filter((s) => s.twinkle)
						.map((s, i) => (
							<span
								key={i}
								className={cn("absolute hidden size-[2.5px] rounded-full bg-ink dark:block", ambient && "animate-pulse")}
								style={{ left: s.x - 1.25, top: s.y - 1.25, opacity: s.o + 0.25, animationDuration: `${s.dur}s` }}
							/>
						))}
				</div>
				{ambient &&
					live.map((s) => {
						const R = s.r + 3;
						return (
							<span
								key={s.id}
								className="co-flare absolute rounded-full border-[1.5px] border-(--co-filament)"
								style={{
									left: s.x - R,
									top: s.y - R,
									width: R * 2,
									height: R * 2,
									animationDuration: "2400ms",
									animationIterationCount: "infinite",
									animationDelay: `${(s.rank * 370) % 2400}ms`,
								}}
							/>
						);
					})}
				{ambient && (
					<div
						className="absolute animate-pulse rounded-full"
						style={{
							left: cx - glowR * 1.25,
							top: cy - glowR * 1.25,
							width: glowR * 2.5,
							height: glowR * 2.5,
							background:
								"radial-gradient(closest-side, color-mix(in oklab, var(--co-accent) 16%, transparent), color-mix(in oklab, var(--co-accent) 5%, transparent) 55%, transparent)",
							animationDuration: "6s",
						}}
					/>
				)}
			</div>
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				className="absolute inset-0 block select-none"
				role="group"
				aria-label={vocab.sceneLabel}
				aria-describedby={ids.hint}
			>
				<defs>
					<radialGradient id={ids.sun} cx="0.4" cy="0.36" r="0.7" fx="0.34" fy="0.28">
						<stop offset="0" style={{ stopColor: "#fff6de" }} />
						<stop offset="0.38" style={{ stopColor: "var(--co-accent)" }} />
						<stop offset="1" style={{ stopColor: "color-mix(in oklab, var(--co-accent) 45%, black)" }} />
					</radialGradient>
					<radialGradient id={ids.sunGlow}>
						<stop offset="0.25" style={{ stopColor: "var(--co-accent)", stopOpacity: 0.34 }} />
						<stop offset="0.6" style={{ stopColor: "var(--co-accent)", stopOpacity: 0.08 }} />
						<stop offset="1" style={{ stopColor: "var(--co-accent)", stopOpacity: 0 }} />
					</radialGradient>
					<filter id={ids.glow} x="-40%" y="-40%" width="180%" height="180%">
						<feGaussianBlur stdDeviation="3.2" />
					</filter>
					<Gloss id={ids.gloss("person")} color="var(--co-agent)" />
					<Gloss id={ids.gloss("machine")} color="var(--co-tool)" />
					<Gloss id={ids.gloss("cat-0")} color="var(--co-cat-0)" />
					<Gloss id={ids.gloss("cat-1")} color="var(--co-cat-1)" />
					{categories.map((c, i) => (
						<linearGradient
							key={c.id}
							id={ids.beam(i)}
							gradientUnits="userSpaceOnUse"
							x1={c.beam.from.x}
							y1={c.beam.from.y}
							x2={c.beam.to.x}
							y2={c.beam.to.y}
						>
							<stop offset="0" style={{ stopColor: "var(--co-accent)", stopOpacity: 0.95 }} />
							<stop offset="0.55" style={{ stopColor: "var(--co-accent)", stopOpacity: 0.5 }} />
							<stop offset="1" style={{ stopColor: "var(--co-accent)", stopOpacity: 0.08 }} />
						</linearGradient>
					))}
				</defs>

				{/* Backdrop: orbit guides (the wash and stars drift in their own layer above) */}
				<g aria-hidden className="pointer-events-none" style={fade}>
					<ellipse
						cx={cx}
						cy={cy}
						rx={rings.r1.rx}
						ry={rings.r1.ry}
						fill="none"
						className="stroke-hairline"
						strokeWidth={1}
					/>
					<ellipse
						cx={cx}
						cy={cy}
						rx={rings.r2.rx}
						ry={rings.r2.ry}
						fill="none"
						className="stroke-hairline"
						strokeWidth={1}
						strokeDasharray="1 7"
						strokeLinecap="round"
					/>
				</g>

				{/* Beams: accent core; blurred halo + filament in the dark theme */}
				<g aria-hidden className="pointer-events-none" style={fade} fill="none" strokeLinecap="round">
					{categories.map((c, i) => {
						const delay = { ["--draw-delay" as string]: `${beamStart(c.order)}ms` };
						const lit = hovered?.category === c.id;
						return (
							<g key={c.id}>
								<path
									d={c.beam.d}
									pathLength={1}
									stroke={`url(#${ids.beam(i)})`}
									className="co-draw-on hidden dark:inline"
									filter={`url(#${ids.glow})`}
									style={{
										...delay,
										strokeWidth: c.beam.width * 3,
										opacity: lit ? 0.5 : 0.28,
										transition: `stroke-width 600ms ${EASE}, opacity 240ms`,
									}}
								/>
								<path
									d={c.beam.d}
									pathLength={1}
									stroke={`url(#${ids.beam(i)})`}
									className="co-draw-on"
									style={{ ...delay, strokeWidth: c.beam.width, transition: `stroke-width 600ms ${EASE}` }}
								/>
								<path
									d={c.beam.filament}
									pathLength={1}
									className="co-draw-on hidden stroke-(--co-filament) dark:inline"
									strokeWidth={0.8}
									style={{ ["--draw-delay" as string]: `${beamStart(c.order) + 100}ms`, opacity: 0.45 }}
								/>
								<path
									d={c.beam.arrow}
									className="co-fade stroke-(--co-accent)/80"
									strokeWidth={1.2}
									strokeLinejoin="round"
									style={{ animationDelay: `${arrive.get(c.id)}ms` }}
								/>
							</g>
						);
					})}
				</g>

				{/* Dotted links category → sender */}
				<g aria-hidden className="pointer-events-none" style={fade} fill="none" strokeLinecap="round">
					{layout.senders.map((s) => (
						<path
							key={s.id}
							d={s.link}
							className={cn(
								"co-entrance transition-[stroke,opacity] duration-200",
								s.id === hoverId ? "stroke-(--co-accent)" : "stroke-ink-mute/70 dark:stroke-(--co-filament)/45",
							)}
							strokeWidth={s.id === hoverId ? 1.4 : 1.1}
							strokeDasharray="0.5 4.5"
							style={{ animationDelay: `${(arrive.get(s.category) ?? 0) + 40}ms`, opacity: s.weight > 0 ? 1 : 0.45 }}
						/>
					))}
				</g>

				{/* The sun. Its tick ring is total volume per day. */}
				<g aria-hidden className="pointer-events-none" style={fade}>
					<g className="co-bloom origin-center [transform-box:fill-box]">
						<circle cx={cx} cy={cy} r={glowR} fill={`url(#${ids.sunGlow})`} className="hidden dark:inline" />
						<circle
							cx={cx}
							cy={cy}
							r={sun.ringInner + sun.ringMax + 4}
							className="fill-(--co-accent)/[0.07]"
						/>
						<path
							d={sun.ring}
							pathLength={1}
							className="co-draw-on stroke-(--co-accent)/85"
							strokeWidth={1.6}
							strokeLinecap="round"
							fill="none"
							style={{ ["--draw-delay" as string]: "140ms" }}
						/>
						<circle cx={cx} cy={cy} r={sun.r + 3} fill="none" className="stroke-(--co-accent)/40" />
						<circle
							cx={cx}
							cy={cy}
							r={sun.r}
							className="fill-(--orbit-sun-paint) drop-shadow-[0_0_16px_color-mix(in_oklab,var(--co-accent)_55%,transparent)]"
						/>
						{sunLabel && (
							<text
								x={cx}
								y={cy}
								textAnchor="middle"
								dominantBaseline="central"
								className="fill-(--co-sun-label) font-semibold"
								style={{ fontSize: sunFont }}
							>
								{vocab.sun}
							</text>
						)}
					</g>
				</g>

				{/* Categories */}
				<g style={fade}>
					{categories.map((c) => (
						<CategoryNode
							key={c.id}
							c={c}
							ids={ids}
							vocab={vocab}
							delay={arrive.get(c.id) ?? 0}
							dim={!!hovered && hovered.category !== c.id}
						/>
					))}
				</g>

				{/* Senders */}
				<g>
					{layout.senders.map((s) => {
						const isFocus = focus?.id === s.id;
						const stat = senders.get(s.id);
						return (
							<SenderNode
								key={s.id}
								s={s}
								ids={ids}
								flagged={stat?.flagged ?? 0}
								delay={senderDelay.get(s.id) ?? 0}
								tabbable={activeId === s.id}
								hovered={hoverId === s.id}
								dim={focused ? !isFocus : !!hovered && hovered.category !== s.category}
								hidden={focused && !isFocus}
								target={isFocus ? focus : null}
								gliding={gliding}
								ariaLabel={ariaLabelFor(s)}
								onHover={onHover}
								onFocusNode={onFocusNode}
								onActivate={onActivate}
								onNavigate={onNavigate}
							/>
						);
					})}
				</g>
			</svg>

			{/*
			 * Ignition: a comet rides each beam's drawing tip out from the sun (same
			 * delay, duration and easing as the draw), the group flashes as it lands,
			 * and dust blows off the sun. CSS only, so data-hold/data-intro/reduced
			 * motion govern it like the rest of the entrance.
			 */}
			{igniting && (
				<div aria-hidden className="pointer-events-none absolute inset-0">
					<div className="hidden dark:block">
						{motes.map((m, i) => (
							<span
								key={i}
								className="co-dust absolute rounded-full bg-[color-mix(in_oklab,var(--co-accent)_60%,white)]"
								style={
									{
										left: cx - m.size / 2,
										top: cy - m.size / 2,
										width: m.size,
										height: m.size,
										animationDelay: `${m.delay}ms`,
										"--dx": `${m.dx}px`,
										"--dy": `${m.dy}px`,
									} as React.CSSProperties
								}
							/>
						))}
					</div>
					{categories.map((c) => {
						const R = c.r + 6;
						return (
							<React.Fragment key={c.id}>
								<span
									className="co-comet absolute top-0 left-0 h-[3px] w-[18px] rounded-full bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--co-accent)_35%,white))] shadow-[0_0_8px_2px_color-mix(in_oklab,var(--co-accent)_55%,transparent)]"
									style={{ offsetPath: `path("${c.beam.d}")`, animationDelay: `${beamStart(c.order)}ms` }}
								/>
								<span
									className="co-flare absolute rounded-full border-[1.5px] border-(--co-accent)"
									style={{ left: c.x - R, top: c.y - R, width: R * 2, height: R * 2, animationDelay: `${arrive.get(c.id)}ms` }}
								/>
							</React.Fragment>
						);
					})}
				</div>
			)}

			{/* Work travelling home: sparks ride each beam inbound, faster when the group is fresher. */}
			{ambient && !focused && (
				<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
					{categories.flatMap((c) =>
						Array.from({ length: c.particles.count }, (_, j) => (
							<Spark
								key={`${c.id}-${j}`}
								track={c.beam.track}
								dur={c.particles.dur / sparkSpeed}
								phase={(j + 0.35) / c.particles.count}
								paused={paused}
							/>
						)),
					)}
				</div>
			)}

			<OrbitTooltip layout={layout} senders={senders} tipId={focused ? null : tipId} now={now} vocab={vocab} />
		</div>
	);
});

/**
 * One point of light riding a beam from its group home to the sun.
 * Web Animations on transform/opacity run on the compositor, so the filtered
 * SVG underneath never repaints.
 */
function Spark({ track, dur, phase, paused }: { track: string; dur: number; phase: number; paused: boolean }) {
	const ref = React.useRef<HTMLSpanElement>(null);
	const anims = React.useRef<Animation[]>([]);
	const pausedRef = React.useRef(paused);
	pausedRef.current = paused;
	React.useEffect(() => {
		const el = ref.current;
		const dot = el?.firstElementChild as HTMLElement | null;
		if (!el || !dot || typeof el.animate !== "function") return;
		const points = track
			.split(" ")
			.map((p) => p.split(",").map(Number) as [number, number])
			.reverse();
		const timing: KeyframeAnimationOptions = {
			duration: dur * 1000,
			delay: -phase * dur * 1000,
			iterations: Infinity,
			easing: "cubic-bezier(0.45, 0, 0.3, 1)",
		};
		const move = el.animate(
			points.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` })),
			timing,
		);
		const glow = dot.animate(
			[{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
			timing,
		);
		anims.current = [move, glow];
		if (pausedRef.current) for (const a of anims.current) a.pause();
		return () => {
			move.cancel();
			glow.cancel();
			anims.current = [];
		};
	}, [track, dur, phase]);
	// Pause holds the spark where it is; unmounting would lose its place on the beam.
	React.useEffect(() => {
		for (const a of anims.current) {
			if (paused) a.pause();
			else a.play();
		}
	}, [paused]);
	return (
		<span ref={ref} className="absolute top-0 left-0 will-change-transform">
			<span className="block size-[3.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_oklab,var(--co-accent)_22%,white)] opacity-0 shadow-[0_0_6px_2px_color-mix(in_oklab,var(--co-accent)_50%,transparent)]" />
		</span>
	);
}

function CategoryNode({
	c,
	ids,
	vocab,
	delay,
	dim,
}: {
	c: OrbitCategory;
	ids: OrbitIds;
	vocab: OrbitVocab;
	/** When this group's beam lands. */
	delay: number;
	dim: boolean;
}) {
	const tone = `var(--co-cat-${c.tone})`;
	const label = c.labelPos;
	return (
		<g
			transform={`translate(${c.x} ${c.y})`}
			role="img"
			aria-label={`${c.label}: ${c.shareText} of ${vocab.mass}, ${formatCount(c.value)} ${vocab.unit[1]}`}
			style={{ ["--cat" as string]: tone, opacity: dim ? 0.6 : 1, transition: "opacity 240ms" }}
		>
			<g className="co-bloom origin-center [transform-box:fill-box]" style={{ animationDelay: `${delay - 80}ms` }}>
				<circle
					r={c.slotR + 12}
					fill="none"
					className="hidden stroke-(--cat) dark:inline"
					strokeOpacity={0.14}
					strokeWidth={1}
				/>
				<circle
					r={c.r + 6}
					fill="none"
					className="stroke-(--cat)"
					strokeOpacity={0.35}
					strokeWidth={1}
					style={{ r: c.r + 6, transition: `r 600ms ${EASE}` }}
				/>
				<circle
					r={c.r}
					className="fill-(--cat-gloss) drop-shadow-[0_0_10px_color-mix(in_oklab,var(--cat)_60%,transparent)]"
					style={{
						["--cat-gloss" as string]: `url(#${ids.gloss(c.tone === 0 ? "cat-0" : "cat-1")})`,
						r: c.r,
						transition: `r 600ms ${EASE}`,
					}}
				/>
			</g>
			{label && (
				// The entrance animates CSS transform, which would override a transform attribute
				// on the same element — so the undo-translate lives one level down.
				<g aria-hidden className="co-entrance pointer-events-none" style={{ animationDelay: `${delay + 60}ms` }}>
					<g transform={`translate(${-c.x} ${-c.y})`}>
						<text
							x={label.x}
							y={label.nameY}
							textAnchor={label.anchor}
							dominantBaseline="central"
							className="orbit-halo fill-ink tracking-[-0.01em]"
							style={{ fontSize: label.size }}
						>
							{c.label}
						</text>
						{label.chip && (
							<g>
								<rect
									x={label.chip.x}
									y={label.chip.y}
									width={label.chip.w}
									height={label.chip.h}
									rx={5}
									className="fill-[color-mix(in_oklab,var(--co-accent)_14%,var(--sg-panel))] stroke-(--co-accent)/30"
									strokeWidth={1}
								/>
								<text
									x={label.chip.x + label.chip.w / 2}
									y={label.chip.y + label.chip.h / 2}
									textAnchor="middle"
									dominantBaseline="central"
									className="fill-[color-mix(in_oklab,var(--co-accent)_72%,var(--sg-ink))] font-mono text-[10px] font-medium tabular-nums"
								>
									{c.shareText}
								</text>
							</g>
						)}
					</g>
				</g>
			)}
		</g>
	);
}

type SenderNodeProps = {
	s: OrbitSender;
	ids: OrbitIds;
	flagged: number;
	/** Entrance delay: after its group lights. */
	delay: number;
	tabbable: boolean;
	hovered: boolean;
	dim: boolean;
	hidden: boolean;
	target: SceneFocus;
	gliding: boolean;
	ariaLabel: string;
	onHover: (id: string | null) => void;
	onFocusNode: (id: string | null) => void;
	onActivate: (id: string) => void;
	onNavigate: (id: string, key: string) => void;
};

function SenderNode({
	s,
	ids,
	flagged,
	delay,
	tabbable,
	hovered,
	dim,
	hidden,
	target,
	gliding,
	ariaLabel,
	onHover,
	onFocusNode,
	onActivate,
	onNavigate,
}: SenderNodeProps) {
	const kind = s.person ? "person" : "machine";
	const role = s.person ? "agent" : "tool";
	const x = target ? target.x : s.x;
	const y = target ? target.y : s.y;
	const r = target ? target.r : s.r;
	const quiet = s.weight === 0;
	const hit = Math.max(s.slotR + 6, 13);
	const dot = { cx: r * 0.74, cy: -r * 0.74 };
	const chip = s.label.chip;
	const name = s.label.name;

	return (
		<g
			data-orbit-sender={s.id}
			role="button"
			tabIndex={tabbable ? 0 : -1}
			aria-label={ariaLabel}
			className="group/node cursor-pointer outline-none"
			style={{
				transform: `translate(${x}px, ${y}px)`,
				opacity: hidden ? 0 : dim ? 0.5 : 1,
				transition: gliding ? `transform 640ms ${EASE}, opacity 300ms ${EASE}` : `opacity 300ms ${EASE}`,
				pointerEvents: hidden ? "none" : undefined,
				["--node" as string]: `var(--co-${role})`,
				["--node-gloss" as string]: `url(#${ids.gloss(kind)})`,
			}}
			onClick={() => onActivate(s.id)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onActivate(s.id);
				} else if (NAV_KEYS.has(e.key)) {
					e.preventDefault();
					onNavigate(s.id, e.key);
				}
			}}
			onFocus={() => onFocusNode(s.id)}
			onBlur={() => onFocusNode(null)}
			onPointerEnter={() => onHover(s.id)}
			onPointerLeave={() => onHover(null)}
		>
			<g className="co-bloom origin-center [transform-box:fill-box]" style={{ animationDelay: `${delay}ms` }}>
				<g
					className="origin-center transition-transform duration-200 [transform-box:fill-box]"
					style={{ transform: hovered && !target ? "scale(1.14)" : undefined }}
				>
					<circle r={hit} fill="transparent" />
					<circle
						r={s.slotR + 5}
						fill="none"
						className="stroke-(--co-filament) opacity-0 transition-opacity group-focus-visible/node:opacity-100"
						strokeWidth={2}
						style={{ r: target ? r + 6 : s.slotR + 5, transition: `r 520ms ${EASE}, opacity 150ms` }}
					/>
					<circle
						r={r}
						className="fill-(--node-gloss) drop-shadow-[0_0_7px_color-mix(in_oklab,var(--node)_55%,transparent)]"
						style={{
							r,
							opacity: quiet && !target ? 0.55 : 1,
							transition: `r 560ms ${EASE}, opacity 300ms`,
						}}
					/>
					{flagged > 0 && (
						<circle
							r={2.8}
							className="fill-(--co-filament) stroke-panel"
							strokeWidth={1.5}
							style={{ cx: dot.cx, cy: dot.cy, opacity: target ? 0 : 1, transition: `cx 520ms ${EASE}, cy 520ms ${EASE}, opacity 200ms` }}
						/>
					)}
				</g>
			</g>
			{(chip || name) && (
				<g
					aria-hidden
					className="co-entrance"
					style={{ animationDelay: `${delay + 60}ms` }}
				>
					<g style={{ opacity: target ? 0 : 1, transition: "opacity 200ms" }}>
						{chip && (
							<g transform={`translate(${chip.x - s.x} ${chip.y - s.y})`}>
								<rect
									width={chip.w}
									height={CHIP_H}
									rx={CHIP_H / 2}
									className={cn(
										"fill-panel/80 stroke-hairline",
										hovered && "stroke-(--co-accent)/60",
									)}
									strokeWidth={1}
								/>
								<text
									x={chip.w / 2}
									y={CHIP_H / 2}
									textAnchor="middle"
									dominantBaseline="central"
									className={cn("fill-ink font-mono text-[10px] tabular-nums", quiet && "fill-ink-mute")}
								>
									{s.value}
								</text>
							</g>
						)}
						{name && (
							<text
								x={name.x - s.x}
								y={name.y - s.y}
								textAnchor={name.anchor}
								dominantBaseline="central"
								className={cn(
									"orbit-halo text-[11.5px] transition-colors",
									hovered ? "fill-ink" : "fill-ink-dim",
								)}
							>
								{name.text}
							</text>
						)}
					</g>
				</g>
			)}
		</g>
	);
}

function OrbitTooltip({
	layout,
	senders,
	tipId,
	now,
	vocab,
}: {
	layout: OrbitLayout;
	senders: Map<string, OrbitNodeData>;
	tipId: string | null;
	now: number | null;
	vocab: OrbitVocab;
}) {
	const node = tipId ? layout.senders.find((s) => s.id === tipId) : undefined;
	const stat = tipId ? senders.get(tipId) : undefined;
	if (!node || !stat) return null;
	const W = 236;
	const H = 118;
	const gap = node.slotR + 14;
	const preferRight = node.side === "right";
	let left = preferRight ? node.x + gap : node.x - gap - W;
	if (left + W > layout.width - 6) left = node.x - gap - W;
	if (left < 6) left = Math.min(layout.width - W - 6, node.x + gap);
	const top = clampNum(node.y - H / 2, 6, layout.height - H - 6);
	const week = layout.week;

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute z-20 rounded-[18px] border border-hairline bg-panel/85 px-4 py-3.5 text-ink shadow-[0_26px_50px_-24px_rgb(0_0_0/0.6)] backdrop-blur-md transition-opacity duration-150 starting:opacity-0"
			style={{ left, top, width: W }}
		>
			<p className="truncate text-[15px] leading-tight">{displayName(stat)}</p>
			<p className="mt-0.5 truncate font-mono text-[11px] text-ink-dim">{stat.detail}</p>
			<div className="mt-2.5 flex items-baseline gap-3">
				<p className="text-[22px] leading-none tabular-nums">{formatCount(node.value)}</p>
				<p className="text-[12px] text-ink-dim">
					{week === null ? `${vocab.unit[1]} · ${vocab.window.all}` : `${vocab.unit[1]} in ${vocab.window.week(week)}`}
				</p>
			</div>
			<p className="mt-2 flex items-center gap-2 text-[12px] text-ink-dim">
				{stat.flagged > 0 ? (
					<span className="inline-flex items-center gap-1.5 text-ink">
						<span className="size-1.5 rounded-full bg-(--co-filament)" />
						{stat.flagged} {vocab.flag.label}
					</span>
				) : (
					<span>{vocab.flag.clear}</span>
				)}
				<span aria-hidden>·</span>
				<span className="truncate">
					{now !== null ? vocab.recency(stat, now) : layout.categories.find((c) => c.id === node.category)?.label}
				</span>
			</p>
		</div>
	);
}
