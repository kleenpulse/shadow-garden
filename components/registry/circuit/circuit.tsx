"use client";

import {
	useEffect,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A circuit board that routes itself. Chips are placed first, then every pin
// grows a trace across a grid, and the gaps are filled with loose traces that
// end in vias. Pulses of light run along the copper.
//
// THE ROUTING. A trace walks the grid in eight directions but thinks in four:
// it has a base axis and may leave it by 45 degrees for a few steps, the way a
// real board jogs around an obstacle. A node belongs to one trace only, and a
// diagonal step claims its cell so that two diagonals can never cross inside
// it. The pins on one side of a chip share the opening moves of their walk, so
// they leave as a bus of parallel lines and only fan out later. Shared moves
// never turn 90 degrees: a bundle that turned together would land on itself.
//
// THE DRAW. The board never changes between rebuilds, so it is painted once
// into a cached layer and a frame is one blit of that layer plus the light on
// top. A second cached layer holds the same copper in the pulse color. The
// pointer shows a soft-edged disc of it, which reads as the copper nearby
// waking up, for the price of one small masked blit.
//
// THE LIGHT. A pulse is a distance along one trace. Its tail is drawn as a few
// chunks of the trace at rising opacity, and all pulses share one path per
// chunk, so the stroke count per frame does not grow with the pulse count. A
// pulse that reaches a chip may leave again from another pin, which is what
// makes the board look like it is passing a signal along.

export interface CircuitProps {
	/** Grid pitch in px. Smaller cells give a finer, busier board. */
	cellSize?: number;
	/** How much of the board is filled, from 0 to 1. */
	density?: number;
	/** How often a new pulse starts. 0 leaves the board dark. */
	pulseRate?: number;
	/** How fast the pulses travel. 0 holds them where they are. */
	speed?: number;
	/** Length of the tail behind each pulse, in px. */
	trail?: number;
	/** How strong the glow around the light is. */
	glow?: number;
	/** The pointer lights the copper near it and starts pulses there. */
	interactive?: boolean;
	/** The copper at rest. */
	traceColor?: string;
	/** The light that runs along the copper. */
	pulseColor?: string;
	/** The board under the copper. */
	boardColor?: string;
	/** Picks the layout. The same seed and size always give the same board. */
	seed?: number;
	/** Halt the pulses where they are. */
	paused?: boolean;
	/** Show a still board with some of the copper lit. */
	reducedMotion?: boolean;
	className?: string;
}

type RGB = [number, number, number];

interface Trace {
	/** Vertices in CSS px: x0, y0, x1, y1, ... */
	pts: number[];
	/** Distance from the start to each vertex. */
	cum: number[];
	len: number;
	padA: number;
	padB: number;
	/** The chip this trace leaves from, at its start. -1 for a loose trace. */
	chip: number;
}

interface Pad {
	x: number;
	y: number;
}

interface Chip {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Traces that leave from this chip's pins. */
	pins: number[];
}

interface Board {
	cell: number;
	cols: number;
	rows: number;
	ox: number;
	oy: number;
	traces: Trace[];
	pads: Pad[];
	chips: Chip[];
	/** Trace index + 1 for every grid node, 0 where there is no copper. */
	owner: Int32Array;
}

interface Pulse {
	tr: number;
	/** Where on the trace it started, and which way it runs. */
	origin: number;
	dir: 1 | -1;
	/** Distance travelled from the origin. */
	s: number;
	/** Speed in px per second. */
	v: number;
	landed: boolean;
	/** How many more chips it may pass through. */
	hops: number;
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

const MAX_PULSES = 260;
/** Tail chunks. Opacity steps up from the tail end to the head. */
const CHUNKS = 5;
/** How far the body of a chip reaches past its outer nodes, in cells. */
const BODY = 0.45;

export default function Circuit({
	cellSize = 22,
	density = 0.7,
	pulseRate = 1,
	speed = 1,
	trail = 70,
	glow = 1,
	interactive = true,
	traceColor = "#2b2440",
	pulseColor = "#b57bff",
	boardColor = "#0a0810",
	seed = 7,
	paused = false,
	reducedMotion = false,
	className = "",
}: CircuitProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawRef = useRef<((dt: number) => void | false) | null>(null);
	const resizeRef = useRef<((m: Metrics) => void) | null>(null);

	const systemStill = useSyncExternalStore(
		subscribeMotion,
		readMotion,
		readMotionOnServer,
	);
	const still = reducedMotion || systemStill;

	// The frame body reads props through this mirror, so tuning never rebuilds
	// the runtime. Written after commit, never during render.
	const latest = {
		cellSize,
		density,
		pulseRate,
		speed,
		trail,
		glow,
		interactive,
		traceColor,
		pulseColor,
		boardColor,
		seed,
		paused,
		still,
	};
	const live = useRef(latest);
	useLayoutEffect(() => {
		live.current = latest;
	});

	const loop = useAnimationLoop({
		target: rootRef,
		halted: paused || still,
		dpr: "auto",
		// A new size is a new board. Waiting for the drag to settle keeps the
		// layout from reshuffling on every pixel of it.
		resizeDebounceMs: 120,
		onResize: (m) => resizeRef.current?.(m),
		onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
	});

	useEffect(() => {
		const root = rootRef.current;
		const canvas = canvasRef.current;
		if (!root || !canvas) return;
		const ctx = canvas.getContext("2d");
		const base = document.createElement("canvas");
		const bctx = base.getContext("2d");
		const lit = document.createElement("canvas");
		const lctx = lit.getContext("2d");
		const scratch = document.createElement("canvas");
		const sctx = scratch.getContext("2d");
		const spark = document.createElement("canvas");
		spark.width = 64;
		spark.height = 64;
		const kctx = spark.getContext("2d");
		const probe = document.createElement("canvas");
		probe.width = 1;
		probe.height = 1;
		const pctx = probe.getContext("2d", { willReadFrequently: true });
		if (!ctx || !bctx || !lctx || !sctx || !kctx || !pctx) return;

		let width = 0;
		let height = 0;
		let dpr = 1;
		let bw = 0;
		let bh = 0;

		let board: Board | null = null;
		const built = { cell: -1, density: -1, seed: -1, w: -1, h: -1 };
		const painted = { trace: "", pulse: "", board: "", stale: true };
		let padHeat = new Float32Array(0);
		let chipHeat = new Float32Array(0);
		const pulses: Pulse[] = [];
		const relays: { at: number; tr: number; hops: number }[] = [];
		let clock = 0;
		let spawnDebt = 0;
		let wakeDebt = 0;
		let traceW = 1;
		let pulseCss = "#b57bff";

		const pointer = { x: 0, y: 0, inside: false, amt: 0, fresh: 0 };

		const launch = (
			tr: number,
			origin: number,
			dir: 1 | -1,
			hops: number,
		) => {
			if (!board || pulses.length >= MAX_PULSES) return;
			pulses.push({
				tr,
				origin,
				dir,
				s: 0,
				v: board.cell * (7 + Math.random() * 5),
				landed: false,
				hops,
			});
		};

		const launchFromEnd = (tr: number, hops: number) => {
			if (!board) return;
			const t = board.traces[tr];
			// A chip trace usually fires from the chip; a loose one from either end.
			const fromStart = t.chip >= 0 ? Math.random() < 0.75 : Math.random() < 0.5;
			if (fromStart) {
				if (t.padA >= 0) padHeat[t.padA] = 1;
				if (t.chip >= 0) chipHeat[t.chip] = Math.max(chipHeat[t.chip], 0.7);
				launch(tr, 0, 1, hops);
			} else {
				if (t.padB >= 0) padHeat[t.padB] = 1;
				launch(tr, t.len, -1, hops);
			}
		};

		const rebuild = () => {
			const l = live.current;
			board = buildBoard(width, height, l.cellSize, l.density, l.seed);
			built.cell = l.cellSize;
			built.density = l.density;
			built.seed = l.seed;
			built.w = width;
			built.h = height;
			padHeat = new Float32Array(board.pads.length);
			chipHeat = new Float32Array(board.chips.length);
			pulses.length = 0;
			relays.length = 0;
			spawnDebt = 0;
			wakeDebt = 0;
			painted.stale = true;
			// Start mid-flight, so the first frame is not an empty board.
			const n = board.traces.length;
			const warm = Math.min(40, Math.round(n * 0.06 * Math.max(0, l.pulseRate)));
			for (let i = 0; i < warm && n > 0; i++) {
				const tr = (Math.random() * n) | 0;
				launchFromEnd(tr, 2);
				const p = pulses[pulses.length - 1];
				if (p) p.s = Math.random() * board.traces[tr].len;
			}
			padHeat.fill(0);
			chipHeat.fill(0);
		};

		// The copper, into either cached layer. `glowing` paints it in the pulse
		// color on a clear ground; otherwise it is the board at rest.
		const paintCopper = (
			g: CanvasRenderingContext2D,
			b: Board,
			color: string,
			ground: RGB,
			copper: RGB,
			glowing: boolean,
		) => {
			const c = b.cell;
			g.setTransform(1, 0, 0, 1, 0, 0);
			g.globalAlpha = 1;
			g.globalCompositeOperation = "source-over";
			if (glowing) {
				g.clearRect(0, 0, bw, bh);
			} else {
				g.fillStyle = css(ground);
				g.fillRect(0, 0, bw, bh);
			}
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.lineCap = "round";
			g.lineJoin = "round";
			g.strokeStyle = color;
			g.fillStyle = color;

			g.lineWidth = traceW;
			g.beginPath();
			for (const t of b.traces) {
				g.moveTo(t.pts[0], t.pts[1]);
				for (let i = 2; i < t.pts.length; i += 2) g.lineTo(t.pts[i], t.pts[i + 1]);
			}
			g.stroke();

			// Pin legs: a short, thicker stub where each trace leaves its chip.
			g.lineCap = "butt";
			g.lineWidth = traceW * 2.4;
			g.beginPath();
			for (const t of b.traces) {
				if (t.chip < 0 || t.pts.length < 4) continue;
				const dx = t.pts[2] - t.pts[0];
				const dy = t.pts[3] - t.pts[1];
				const d = Math.hypot(dx, dy) || 1;
				const reach = Math.min(d, c * 0.32);
				g.moveTo(t.pts[0], t.pts[1]);
				g.lineTo(t.pts[0] + (dx / d) * reach, t.pts[1] + (dy / d) * reach);
			}
			g.stroke();
			g.lineCap = "round";

			const r = Math.max(2, c * 0.07);
			for (const chip of b.chips) {
				roundedRect(g, chip.x, chip.y, chip.w, chip.h, r);
				if (glowing) {
					g.globalCompositeOperation = "destination-out";
					g.fill();
					g.globalCompositeOperation = "source-over";
				} else {
					g.fillStyle = css(mix(ground, copper, 0.3));
					g.fill();
				}
				g.lineWidth = traceW;
				g.stroke();
				if (glowing) continue;
				// What makes a rectangle read as a part: a pin-one dot and a
				// couple of lines of marking.
				g.fillStyle = color;
				g.beginPath();
				g.arc(chip.x + c * 0.3, chip.y + c * 0.3, Math.max(1, c * 0.07), 0, Math.PI * 2);
				g.fill();
				g.globalAlpha = 0.55;
				g.lineWidth = Math.max(1, traceW * 0.8);
				const mx = chip.x + chip.w * 0.3;
				const my = chip.y + chip.h * 0.5;
				g.beginPath();
				g.moveTo(mx, my - c * 0.12);
				g.lineTo(mx + chip.w * 0.4, my - c * 0.12);
				g.moveTo(mx, my + c * 0.12);
				g.lineTo(mx + chip.w * 0.26, my + c * 0.12);
				g.stroke();
				g.globalAlpha = 1;
			}

			// Vias: a ring with the board showing through the hole.
			const pr = c * 0.2;
			g.lineWidth = traceW;
			for (const pad of b.pads) {
				g.beginPath();
				g.arc(pad.x, pad.y, pr, 0, Math.PI * 2);
				if (glowing) {
					g.globalCompositeOperation = "destination-out";
					g.fill();
					g.globalCompositeOperation = "source-over";
				} else {
					g.fillStyle = css(ground);
					g.fill();
				}
				g.stroke();
			}
		};

		const paintLayers = () => {
			const l = live.current;
			if (!board) return;
			const ground = readColor(pctx, l.boardColor, "#0a0810");
			const copper = readColor(pctx, l.traceColor, "#2b2440");
			const light = readColor(pctx, l.pulseColor, "#b57bff");
			pulseCss = css(light);
			traceW = Math.max(1, Math.min(3, board.cell * 0.085));
			if (base.width !== bw || base.height !== bh) {
				base.width = bw;
				base.height = bh;
				lit.width = bw;
				lit.height = bh;
			}
			paintCopper(bctx, board, css(copper), ground, copper, false);
			paintCopper(lctx, board, pulseCss, ground, light, true);

			// The head of a pulse: a hot core that falls off into the pulse color.
			const hot = mix(light, [255, 255, 255], 0.75);
			kctx.clearRect(0, 0, 64, 64);
			const grad = kctx.createRadialGradient(32, 32, 0, 32, 32, 32);
			grad.addColorStop(0, `rgba(${hot[0]},${hot[1]},${hot[2]},1)`);
			grad.addColorStop(0.16, `rgba(${light[0]},${light[1]},${light[2]},0.85)`);
			grad.addColorStop(0.45, `rgba(${light[0]},${light[1]},${light[2]},0.22)`);
			grad.addColorStop(1, `rgba(${light[0]},${light[1]},${light[2]},0)`);
			kctx.fillStyle = grad;
			kctx.fillRect(0, 0, 64, 64);

			painted.trace = l.traceColor;
			painted.pulse = l.pulseColor;
			painted.board = l.boardColor;
			painted.stale = false;
		};

		// Start a pair of pulses on the copper nearest the pointer, running away
		// from it in both directions.
		const wake = (b: Board) => {
			for (let tries = 0; tries < 8; tries++) {
				const a = Math.random() * Math.PI * 2;
				const d = Math.sqrt(Math.random()) * b.cell * 2.4;
				const gx = Math.round((pointer.x + Math.cos(a) * d - b.ox) / b.cell);
				const gy = Math.round((pointer.y + Math.sin(a) * d - b.oy) / b.cell);
				if (gx < 0 || gy < 0 || gx >= b.cols || gy >= b.rows) continue;
				const own = b.owner[gy * b.cols + gx];
				if (own === 0) continue;
				const t = b.traces[own - 1];
				const at = nearestOn(t, pointer.x, pointer.y);
				launch(own - 1, at, 1, 1);
				launch(own - 1, at, -1, 1);
				return;
			}
		};

		const draw = (dt: number): void | false => {
			const l = live.current;
			if (width < 2 || height < 2) return;
			if (
				!board ||
				built.cell !== l.cellSize ||
				built.density !== l.density ||
				built.seed !== l.seed ||
				built.w !== width ||
				built.h !== height
			) {
				rebuild();
			}
			if (
				painted.stale ||
				painted.trace !== l.traceColor ||
				painted.pulse !== l.pulseColor ||
				painted.board !== l.boardColor
			) {
				paintLayers();
			}
			const b = board;
			if (!b) return;

			const frozen = l.paused || l.still;
			const step = frozen ? 0 : dt * Math.max(0, l.speed);
			const trailLen = Math.max(1, l.trail);
			const glowAmt = Math.max(0, l.glow);
			clock += step;

			const awake = l.interactive && !frozen && pointer.inside;
			pointer.amt += ((awake ? 1 : 0) - pointer.amt) * (1 - Math.exp(-dt * 8));
			pointer.fresh = Math.max(0, pointer.fresh - dt);

			if (!frozen) {
				const n = b.traces.length;
				if (n > 0) {
					spawnDebt += step * Math.max(0, l.pulseRate) * (0.25 + n * 0.07);
					while (spawnDebt >= 1) {
						spawnDebt -= 1;
						launchFromEnd((Math.random() * n) | 0, 2);
					}
					if (awake) {
						// A moving pointer stirs up far more than a resting one.
						wakeDebt += dt * (pointer.fresh > 0 ? 12 : 2);
						while (wakeDebt >= 1) {
							wakeDebt -= 1;
							wake(b);
						}
					}
				}

				for (let i = relays.length - 1; i >= 0; i--) {
					if (relays[i].at > clock) continue;
					const relay = relays[i];
					relays[i] = relays[relays.length - 1];
					relays.pop();
					launch(relay.tr, 0, 1, relay.hops);
				}

				for (let i = pulses.length - 1; i >= 0; i--) {
					const p = pulses[i];
					const t = b.traces[p.tr];
					p.s += p.v * step;
					const head = p.origin + p.dir * p.s;
					if (!p.landed && (p.dir > 0 ? head >= t.len : head <= 0)) {
						p.landed = true;
						const pad = p.dir > 0 ? t.padB : t.padA;
						if (pad >= 0) padHeat[pad] = 1;
						if (p.dir < 0 && t.chip >= 0) {
							chipHeat[t.chip] = 1;
							const pins = b.chips[t.chip].pins;
							if (p.hops > 0 && pins.length > 1 && Math.random() < 0.6) {
								let next = pins[(Math.random() * pins.length) | 0];
								if (next === p.tr) next = pins[(pins.indexOf(next) + 1) % pins.length];
								relays.push({
									at: clock + 0.08 + Math.random() * 0.22,
									tr: next,
									hops: p.hops - 1,
								});
							}
						}
					}
					const tail = p.origin + p.dir * Math.max(0, p.s - trailLen);
					if (p.dir > 0 ? tail >= t.len : tail <= 0) {
						pulses[i] = pulses[pulses.length - 1];
						pulses.pop();
					}
				}

				const cool = Math.exp(-dt * 3.2);
				for (let i = 0; i < padHeat.length; i++) padHeat[i] *= cool;
				for (let i = 0; i < chipHeat.length; i++) chipHeat[i] *= cool;
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;
			ctx.drawImage(base, 0, 0);

			if (l.still) {
				// No motion to show, so show the state instead: one trace in six
				// is simply lit.
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				ctx.globalCompositeOperation = "lighter";
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.strokeStyle = pulseCss;
				ctx.beginPath();
				for (let i = 0; i < b.traces.length; i += 6) {
					tracePath(ctx, b.traces[i], 0, b.traces[i].len);
				}
				if (glowAmt > 0) {
					ctx.globalAlpha = Math.min(1, 0.14 * glowAmt);
					ctx.lineWidth = traceW * 4;
					ctx.stroke();
				}
				ctx.globalAlpha = 0.7;
				ctx.lineWidth = traceW * 1.2;
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.globalCompositeOperation = "source-over";
				return;
			}

			if (pointer.amt > 0.01) {
				const reach = Math.min(260, b.cell * 5);
				const size = Math.max(2, Math.ceil(reach * 2 * dpr));
				if (scratch.width !== size) {
					scratch.width = size;
					scratch.height = size;
				}
				const sx = Math.round(pointer.x * dpr - size / 2);
				const sy = Math.round(pointer.y * dpr - size / 2);
				sctx.setTransform(1, 0, 0, 1, 0, 0);
				sctx.globalCompositeOperation = "source-over";
				sctx.clearRect(0, 0, size, size);
				sctx.drawImage(lit, -sx, -sy);
				sctx.globalCompositeOperation = "destination-in";
				const fade = sctx.createRadialGradient(
					size / 2,
					size / 2,
					0,
					size / 2,
					size / 2,
					size / 2,
				);
				fade.addColorStop(0, "rgba(0,0,0,1)");
				fade.addColorStop(0.4, "rgba(0,0,0,0.55)");
				fade.addColorStop(1, "rgba(0,0,0,0)");
				sctx.fillStyle = fade;
				sctx.fillRect(0, 0, size, size);
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = 0.6 * pointer.amt;
				ctx.drawImage(scratch, sx, sy);
			}

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.globalCompositeOperation = "lighter";
			ctx.strokeStyle = pulseCss;
			ctx.lineJoin = "round";
			// Butt caps: the chunks meet end to end, and a round cap would add
			// a bright bead at every join.
			ctx.lineCap = "butt";

			for (let k = 0; k < CHUNKS; k++) {
				ctx.beginPath();
				for (const p of pulses) {
					const t = b.traces[p.tr];
					const head = clamp(p.origin + p.dir * p.s, 0, t.len);
					const tail = clamp(
						p.origin + p.dir * Math.max(0, p.s - trailLen),
						0,
						t.len,
					);
					const from = tail + (head - tail) * (k / CHUNKS);
					const to = tail + (head - tail) * ((k + 1) / CHUNKS);
					if (Math.abs(to - from) < 0.01) continue;
					tracePath(ctx, t, Math.min(from, to), Math.max(from, to));
				}
				const f = (k + 1) / CHUNKS;
				if (glowAmt > 0) {
					ctx.globalAlpha = Math.min(1, 0.16 * f * f * glowAmt);
					ctx.lineWidth = traceW * 4;
					ctx.stroke();
				}
				ctx.globalAlpha = f * f;
				ctx.lineWidth = traceW * 1.3;
				ctx.stroke();
			}

			const headR = traceW * 2.2 + b.cell * 0.38 * glowAmt;
			for (const p of pulses) {
				const t = b.traces[p.tr];
				const raw = p.origin + p.dir * p.s;
				const over = p.dir > 0 ? raw - t.len : -raw;
				const alpha = over > 0 ? 1 - over / trailLen : 1;
				if (alpha <= 0) continue;
				const [hx, hy] = pointAt(t, clamp(raw, 0, t.len));
				ctx.globalAlpha = alpha;
				ctx.drawImage(spark, hx - headR, hy - headR, headR * 2, headR * 2);
			}

			const padR = b.cell * 0.2;
			ctx.lineWidth = traceW * 1.2;
			for (let i = 0; i < padHeat.length; i++) {
				const heat = padHeat[i];
				if (heat < 0.02) continue;
				const pad = b.pads[i];
				ctx.globalAlpha = heat;
				ctx.beginPath();
				ctx.arc(pad.x, pad.y, padR, 0, Math.PI * 2);
				ctx.stroke();
				if (glowAmt > 0) {
					const gr = b.cell * 0.7;
					ctx.globalAlpha = Math.min(1, heat * 0.5 * glowAmt);
					ctx.drawImage(spark, pad.x - gr, pad.y - gr, gr * 2, gr * 2);
				}
			}

			const chipR = Math.max(2, b.cell * 0.07);
			ctx.fillStyle = pulseCss;
			for (let i = 0; i < chipHeat.length; i++) {
				const heat = chipHeat[i];
				if (heat < 0.02) continue;
				const chip = b.chips[i];
				roundedRect(ctx, chip.x, chip.y, chip.w, chip.h, chipR);
				ctx.globalAlpha = heat * 0.1;
				ctx.fill();
				ctx.globalAlpha = heat * 0.9;
				ctx.lineWidth = traceW * 1.2;
				ctx.stroke();
			}

			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = "source-over";
		};

		const resize = (m: Metrics) => {
			width = m.width;
			height = m.height;
			dpr = m.dpr;
			bw = m.bufferWidth;
			bh = m.bufferHeight;
			canvas.width = bw;
			canvas.height = bh;
			painted.stale = true;
		};

		drawRef.current = draw;
		resizeRef.current = resize;

		// A background usually sits behind other content, which would swallow
		// pointer events bound to the canvas. So the pointer is read from the
		// window and placed against the canvas's own box.
		const onMove = (e: PointerEvent) => {
			const rect = root.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
			pointer.inside = inside;
			if (!inside) return;
			pointer.x = x;
			pointer.y = y;
			pointer.fresh = 0.25;
		};
		const onGone = () => {
			pointer.inside = false;
		};
		const onUp = (e: PointerEvent) => {
			// A finger that lifts has no hover to leave behind.
			if (e.pointerType !== "mouse") pointer.inside = false;
		};
		const doc = document.documentElement;
		window.addEventListener("pointermove", onMove, { passive: true });
		window.addEventListener("pointerup", onUp, { passive: true });
		window.addEventListener("pointercancel", onGone, { passive: true });
		window.addEventListener("blur", onGone);
		doc.addEventListener("pointerleave", onGone);

		// The host's own setup ran before this effect and found the refs empty.
		loop.resize();
		loop.start();

		return () => {
			drawRef.current = null;
			resizeRef.current = null;
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onGone);
			window.removeEventListener("blur", onGone);
			doc.removeEventListener("pointerleave", onGone);
			// Hand the offscreen memory back now rather than at the next GC:
			// Safari caps total canvas memory per page, and previews come and go.
			for (const c of [base, lit, scratch, spark, probe]) {
				c.width = 0;
				c.height = 0;
			}
		};
	}, [loop]);

	// Tuning while halted still repaints: a paused board shows a new color or a
	// new layout at once.
	useEffect(() => {
		loop.paint();
	}, [
		loop,
		cellSize,
		density,
		pulseRate,
		speed,
		trail,
		glow,
		interactive,
		traceColor,
		pulseColor,
		boardColor,
		seed,
		paused,
		still,
	]);

	return (
		<div
			ref={rootRef}
			aria-hidden="true"
			className={`relative h-full w-full overflow-hidden ${className}`.trim()}
		>
			<canvas ref={canvasRef} className="absolute inset-0 block size-full" />
		</div>
	);
}

/** Lay out a board for a box of the given size, in CSS px. */
function buildBoard(
	width: number,
	height: number,
	cellIn: number,
	densityIn: number,
	seed: number,
): Board {
	const cell = clamp(Number.isFinite(cellIn) ? cellIn : 22, 8, 96);
	const density = clamp(Number.isFinite(densityIn) ? densityIn : 0.7, 0, 1);
	// One node of bleed on every side, so copper runs off the edge instead of
	// stopping short of it.
	const cols = Math.ceil(width / cell) + 3;
	const rows = Math.ceil(height / cell) + 3;
	const ox = (width - (cols - 1) * cell) / 2;
	const oy = (height - (rows - 1) * cell) / 2;
	const rand = mulberry32(Math.round(seed) * 7919 + cols * 131 + rows);

	const occ = new Uint8Array(cols * rows);
	const diag = new Uint8Array(cols * rows);
	const owner = new Int32Array(cols * rows);
	const traces: Trace[] = [];
	const pads: Pad[] = [];
	const chips: Chip[] = [];
	const reach = Math.max(cols, rows) * 0.5;

	const free = (x: number, y: number, d: number): boolean => {
		const nx = x + DX[d];
		const ny = y + DY[d];
		if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false;
		if (occ[ny * cols + nx]) return false;
		if (d & 1 && diag[Math.min(y, ny) * cols + Math.min(x, nx)]) return false;
		return true;
	};

	// Walk from a node and claim every node on the way. `script` is the shared
	// opening of a pin bundle: offsets from the base direction, one per step.
	const route = (
		sx: number,
		sy: number,
		baseIn: number,
		script: number[] | null,
		steps: number,
	): number[] => {
		const path = [sx, sy];
		occ[sy * cols + sx] = 1;
		let x = sx;
		let y = sy;
		let base = baseIn;
		let cur = baseIn;
		let side = 0;
		let jog = 0;
		for (let i = 0; i < steps; i++) {
			if (script && i < script.length) {
				if (script[i] !== 0) side = script[i];
				cur = (base + script[i] + 8) & 7;
			} else if (cur === base) {
				if (rand() < 0.2) {
					side = rand() < 0.5 ? 1 : -1;
					cur = (base + side + 8) & 7;
					jog = 1 + ((rand() * 3) | 0);
				}
			} else if (--jog <= 0) {
				// Coming off a jog: either back to the old axis, or on round to
				// the next one, which makes the jog half of a 90 degree turn.
				if (rand() < 0.3) base = (base + side * 2 + 8) & 7;
				cur = base;
			}
			let d = cur;
			if (!free(x, y, d)) {
				const a = (cur + 1) & 7;
				const b = (cur + 7) & 7;
				const first = rand() < 0.5 ? a : b;
				const second = first === a ? b : a;
				if (free(x, y, first)) d = first;
				else if (free(x, y, second)) d = second;
				else break;
				if ((d & 1) === 0) {
					base = d;
					jog = 0;
				} else {
					if (((base + 1) & 7) !== d && ((base + 7) & 7) !== d) {
						base = (d + (rand() < 0.5 ? 1 : 7)) & 7;
					}
					side = ((base + 1) & 7) === d ? 1 : -1;
					jog = 1 + ((rand() * 2) | 0);
				}
				cur = d;
			}
			const nx = x + DX[d];
			const ny = y + DY[d];
			if (d & 1) diag[Math.min(y, ny) * cols + Math.min(x, nx)] = 1;
			occ[ny * cols + nx] = 1;
			x = nx;
			y = ny;
			path.push(x, y);
		}
		return path;
	};

	const addPad = (gx: number, gy: number): number => {
		pads.push({ x: ox + gx * cell, y: oy + gy * cell });
		return pads.length - 1;
	};

	// Turn a walk into a trace. `lead` is an extra first vertex, used to start a
	// pin's trace on the edge of its chip instead of one node out.
	const commit = (
		path: number[],
		chip: number,
		lead: [number, number] | null,
	): number => {
		const n = path.length / 2;
		const index = traces.length;
		const pts: number[] = lead ? [lead[0], lead[1]] : [];
		for (let i = 0; i < n; i++) {
			const x = path[i * 2];
			const y = path[i * 2 + 1];
			owner[y * cols + x] = index + 1;
			if (i > 0 && i < n - 1) {
				// Keep only the corners.
				const ax = x - path[i * 2 - 2];
				const ay = y - path[i * 2 - 1];
				const bx = path[i * 2 + 2] - x;
				const by = path[i * 2 + 3] - y;
				if (ax === bx && ay === by) continue;
			}
			pts.push(ox + x * cell, oy + y * cell);
		}
		const cum = [0];
		for (let i = 2; i < pts.length; i += 2) {
			cum.push(
				cum[cum.length - 1] +
					Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]),
			);
		}
		traces.push({
			pts,
			cum,
			len: cum[cum.length - 1],
			padA: chip < 0 ? addPad(path[0], path[1]) : -1,
			padB: n > 1 || chip < 0 ? addPad(path[path.length - 2], path[path.length - 1]) : -1,
			chip,
		});
		return index;
	};

	const area = cols * rows;

	const wanted = Math.round((area / 420) * (0.35 + density));
	for (let c = 0; c < wanted; c++) {
		for (let attempt = 0; attempt < 12; attempt++) {
			const flat = rand() < 0.6;
			const long = 3 + ((rand() * 4) | 0);
			const short = 2 + ((rand() * 2) | 0);
			const w = flat ? long : short;
			const h = flat ? short : long;
			if (cols - w - 5 <= 0 || rows - h - 5 <= 0) break;
			const x0 = 3 + ((rand() * (cols - w - 5)) | 0);
			const y0 = 3 + ((rand() * (rows - h - 5)) | 0);
			const x1 = x0 + w - 1;
			const y1 = y0 + h - 1;
			let clear = true;
			for (let y = y0 - 2; y <= y1 + 2 && clear; y++) {
				for (let x = x0 - 2; x <= x1 + 2; x++) {
					if (occ[y * cols + x]) {
						clear = false;
						break;
					}
				}
			}
			if (!clear) continue;

			// The body, and the two sides without pins, so nothing hugs them.
			for (let y = y0; y <= y1; y++) {
				for (let x = x0; x <= x1; x++) occ[y * cols + x] = 1;
			}
			if (flat) {
				for (let y = y0; y <= y1; y++) {
					occ[y * cols + x0 - 1] = 1;
					occ[y * cols + x1 + 1] = 1;
				}
			} else {
				for (let x = x0; x <= x1; x++) {
					occ[(y0 - 1) * cols + x] = 1;
					occ[(y1 + 1) * cols + x] = 1;
				}
			}

			const chip: Chip = {
				x: ox + (x0 - BODY) * cell,
				y: oy + (y0 - BODY) * cell,
				w: (w - 1 + BODY * 2) * cell,
				h: (h - 1 + BODY * 2) * cell,
				pins: [],
			};
			const chipIndex = chips.length;
			chips.push(chip);

			// Each side: [first pin x, first pin y, step x, step y, direction out].
			const sides: [number, number, number, number, number][] = flat
				? [
						[x0, y0 - 1, 1, 0, 6],
						[x0, y1 + 1, 1, 0, 2],
					]
				: [
						[x0 - 1, y0, 0, 1, 4],
						[x1 + 1, y0, 0, 1, 0],
					];
			// Claim every pin first, so one pin's trace cannot run through the
			// next pin's node.
			for (const [px, py, sx, sy] of sides) {
				for (let i = 0; i < long; i++) occ[(py + sy * i) * cols + px + sx * i] = 1;
			}
			for (const [px, py, sx, sy, out] of sides) {
				const opening = 2 + ((rand() * 5) | 0);
				const script: number[] = [];
				if (rand() < 0.7) {
					const turn = rand() < 0.5 ? 1 : -1;
					const at = 1 + ((rand() * opening) | 0);
					const run = 1 + ((rand() * 2) | 0);
					for (let i = 0; i < opening + run; i++) {
						script.push(i >= at && i < at + run ? turn : 0);
					}
				} else {
					for (let i = 0; i < opening; i++) script.push(0);
				}
				for (let i = 0; i < long; i++) {
					if (rand() < 0.15) continue;
					const gx = px + sx * i;
					const gy = py + sy * i;
					const steps = script.length + ((rand() * reach) | 0);
					const path = route(gx, gy, out, script, steps);
					const lead: [number, number] = [
						ox + (gx - DX[out] * (1 - BODY)) * cell,
						oy + (gy - DY[out] * (1 - BODY)) * cell,
					];
					chip.pins.push(commit(path, chipIndex, lead));
				}
			}
			break;
		}
	}

	const loose = Math.round(area * density * 0.09);
	for (let i = 0; i < loose; i++) {
		const x = (rand() * cols) | 0;
		const y = (rand() * rows) | 0;
		if (occ[y * cols + x]) continue;
		const base = ((rand() * 4) | 0) * 2;
		const steps = 3 + ((rand() * rand() * reach) | 0);
		const path = route(x, y, base, null, steps);
		// A walk that went nowhere is left as a bare via now and then.
		if (path.length < 4) {
			if (rand() < 0.25) addPad(x, y);
			continue;
		}
		commit(path, -1, null);
	}

	return { cell, cols, rows, ox, oy, traces, pads, chips, owner };
}

/** Add the part of a trace between two distances to the current path. */
function tracePath(
	g: CanvasRenderingContext2D,
	t: Trace,
	from: number,
	to: number,
) {
	const { pts, cum } = t;
	const last = cum.length - 1;
	let i = 0;
	while (i < last - 1 && cum[i + 1] <= from) i++;
	const span = cum[i + 1] - cum[i] || 1;
	const k = (from - cum[i]) / span;
	g.moveTo(
		pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * k,
		pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * k,
	);
	while (i < last && cum[i + 1] < to) {
		i++;
		g.lineTo(pts[i * 2], pts[i * 2 + 1]);
	}
	if (i >= last) return;
	const tail = cum[i + 1] - cum[i] || 1;
	const j = (to - cum[i]) / tail;
	g.lineTo(
		pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * j,
		pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * j,
	);
}

/** The point at a distance along a trace. */
function pointAt(t: Trace, at: number): [number, number] {
	const { pts, cum } = t;
	const last = cum.length - 1;
	if (last < 1) return [pts[0], pts[1]];
	let i = 0;
	while (i < last - 1 && cum[i + 1] <= at) i++;
	const span = cum[i + 1] - cum[i] || 1;
	const k = clamp((at - cum[i]) / span, 0, 1);
	return [
		pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * k,
		pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * k,
	];
}

/** The distance along a trace that is closest to a point. */
function nearestOn(t: Trace, x: number, y: number): number {
	const { pts, cum } = t;
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < cum.length - 1; i++) {
		const ax = pts[i * 2];
		const ay = pts[i * 2 + 1];
		const bx = pts[i * 2 + 2] - ax;
		const by = pts[i * 2 + 3] - ay;
		const l2 = bx * bx + by * by || 1;
		const k = clamp(((x - ax) * bx + (y - ay) * by) / l2, 0, 1);
		const dx = ax + bx * k - x;
		const dy = ay + by * k - y;
		const d = dx * dx + dy * dy;
		if (d < bestD) {
			bestD = d;
			best = cum[i] + (cum[i + 1] - cum[i]) * k;
		}
	}
	return best;
}

function roundedRect(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	const k = Math.min(r, w / 2, h / 2);
	g.beginPath();
	g.moveTo(x + k, y);
	g.arcTo(x + w, y, x + w, y + h, k);
	g.arcTo(x + w, y + h, x, y + h, k);
	g.arcTo(x, y + h, x, y, k);
	g.arcTo(x, y, x + w, y, k);
	g.closePath();
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

function subscribeMotion(onChange: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return () => {};
	const query = window.matchMedia("(prefers-reduced-motion: reduce)");
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function readMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		!!window.matchMedia &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function readMotionOnServer(): boolean {
	return false;
}

/** Deterministic PRNG: the same seed always gives the same board. */
function mulberry32(seed: number): () => number {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Any CSS color to RGB, by letting the canvas parse it. */
function readColor(
	probe: CanvasRenderingContext2D,
	value: string,
	fallback: string,
): RGB {
	probe.fillStyle = fallback;
	probe.fillStyle = value;
	probe.clearRect(0, 0, 1, 1);
	probe.fillRect(0, 0, 1, 1);
	const d = probe.getImageData(0, 0, 1, 1).data;
	return [d[0], d[1], d[2]];
}

function css(c: RGB): string {
	return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function mix(a: RGB, b: RGB, k: number): RGB {
	return [
		Math.round(a[0] + (b[0] - a[0]) * k),
		Math.round(a[1] + (b[1] - a[1]) * k),
		Math.round(a[2] + (b[2] - a[2]) * k),
	];
}
