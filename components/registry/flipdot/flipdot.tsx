"use client";

import {
	useEffect,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// An electromechanical flip-dot sign. Every dot is a small disc, bright on one
// face and dark on the other, sitting in a socket. A word is shown by turning
// the right discs face up, and the next word arrives as a sweep of discs
// turning over, each one squashing as it goes edge-on and swinging a little
// past flat before it settles.
//
// THE LETTERS. At the default 14 rows the sign is about 41 columns wide, so a
// six-letter word gets seven dots of height. A system font rasterised that
// small clogs: heavy weights close their counters, light ones leave strokes
// that come and go depending on where they land between two columns. Real
// signs solve this with a bitmap face, and so does this one: a 5x7 dot face is
// used whenever the system font would come out under ten rows. Taller signs
// have the room, and there each word is rasterised from the font itself, with
// its ink snapped to whole rows so flat tops and bottoms fill a row instead of
// smearing across two. Passing `fontFamily` always draws that font.
//
// THE DRAW. The pitch is a whole number of device pixels, so every cell starts
// on a pixel and a disc is one sprite stamped into each cell. Resting discs
// live in a cached layer that is only touched when a disc starts or stops
// moving. A frame is one blit of that layer plus the discs in flight, each a
// sprite squashed by |cos θ| and shaded by how far it has turned. Holds keep
// redrawing: the blit is the whole cost.
//
// THE STATE. Each dot has a word value and a temporary inversion from the
// pointer, and is always heading for (word XOR inversion). Every change of
// that target is a flip from wherever the disc is right now, so a hover, a
// ripple and a cascade can cross the same disc without fighting.
//
// THE REAL TEXT. The canvas is decoration. The current word sits on top as a
// transparent span sized and placed over the dots, so it can be selected,
// searched and read by a screen reader. It is not a live region: a sign that
// changes every few seconds would talk over everything else on the page.

export type FlipdotCascade = "columns" | "diagonal" | "radial" | "random";

export interface FlipdotProps {
	/** The words the sign shows, in order. With more than one it cycles. */
	words?: string[];
	/** Rows of dots. The columns fill the width. */
	rows?: number;
	/** The order the discs turn in when the word changes. */
	cascade?: FlipdotCascade;
	/** Delay between one step of the cascade and the next, in ms. */
	stagger?: number;
	/** Time one disc takes to turn over, in ms. */
	flipDuration?: number;
	/** How far a disc swings past flat before it settles. */
	overshoot?: number;
	/** Seconds each word stays up after it lands. */
	hold?: number;
	/** The pointer flips the discs it passes over; a press sends a wave. */
	ripple?: boolean;
	/** The bright face of a disc. */
	onColor?: string;
	/** The dark face of a disc. */
	offColor?: string;
	/** The sign behind the discs. */
	boardColor?: string;
	/**
	 * Draw the words in this font instead of the sign's own dot face. A
	 * webfont is awaited before it is drawn.
	 */
	fontFamily?: string;
	/** Halt the sign where it is. */
	paused?: boolean;
	/** Show the first word, still. No cycle, hover or ripple. */
	reducedMotion?: boolean;
	className?: string;
}

const DEFAULT_WORDS = ["FLIP", "DOT"];

/** Same stack as the span on top, so the selectable text matches the dots. */
const SYSTEM_FONT = 'ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const WEIGHT = 800;

/** Disc radius, as a share of the cell pitch. */
const DISC = 0.42;
/** Radius of the socket the disc sits in. Shows as a dark ring at rest and as
 *  the hole behind a disc that is edge-on. */
const SOCKET = 0.47;
/** Shade steps for a turning disc. */
const SHADES = 12;
/** Thinnest a disc gets edge-on. Never zero: a disc that vanishes mid-turn
 *  reads as a hole in the sign. */
const EDGE = 0.06;
/** Below this |cos θ| the disc's rim catches the light. */
const GLINT = 0.3;

/** Brush radius in dots, and how long a brushed disc stays turned. */
const BRUSH = 1.2;
const BRUSH_HOLD = 0.45;
/** Ripple front speed in dots per second, and how long each disc it passes
 *  stays turned. */
const RIPPLE_SPEED = 26;
const RIPPLE_HOLD = 0.32;
const MAX_RIPPLES = 3;

/** Under this many rows of ink, the system font clogs and the dot face takes
 *  over. */
const FACE_BELOW = 10;

// The sign's own 5x7 dot face. Each glyph is its width, then seven rows as one
// base-32 digit each, most significant bit on the left.
const FACE: Record<string, string> = {
	A: "5ehhvhhh",
	B: "5uhhuhhu",
	C: "5ehggghe",
	D: "5uhhhhhu",
	E: "5vgguggv",
	F: "5vgguggg",
	G: "5ehgnhhf",
	H: "5hhhvhhh",
	I: "37222227",
	J: "572222ic",
	K: "5hikokih",
	L: "5ggggggv",
	M: "5hrllhhh",
	N: "5hhpljhh",
	O: "5ehhhhhe",
	P: "5uhhuggg",
	Q: "5ehhhlid",
	R: "5uhhukih",
	S: "5fgge11u",
	T: "5v444444",
	U: "5hhhhhhe",
	V: "5hhhhha4",
	W: "5hhhllla",
	X: "5hha4ahh",
	Y: "5hha4444",
	Z: "5v1248gv",
	"0": "5ehjlphe",
	"1": "54c4444e",
	"2": "5eh1248v",
	"3": "5v2421he",
	"4": "526aiv22",
	"5": "5vgu11he",
	"6": "568guhhe",
	"7": "5v124888",
	"8": "5ehhehhe",
	"9": "5ehhf12c",
	" ": "20000000",
	".": "10000001",
	",": "20000012",
	"!": "11111101",
	"?": "5eh12404",
	"-": "4000f000",
	":": "10100010",
	"'": "11100000",
	'"': "35500000",
	"/": "511248gg",
	"+": "5044v440",
	"=": "400f0f00",
	"(": "31244421",
	")": "34211124",
	"&": "5cik8lid",
	"#": "5aavavaa",
	"*": "504lel40",
	"%": "5op248j3",
	_: "5000000v",
	"<": "41248421",
	">": "48421248",
};

interface Glyph {
	w: number;
	bits: number[];
}

const GLYPHS = decodeFace(FACE);

type RGB = [number, number, number];

/** A word laid out on the grid, plus where its real text goes, in dots. */
interface Plate {
	bits: Uint8Array;
	/** Left edge of the text. */
	x: number;
	/** Baseline. */
	base: number;
	/** Font size for the span on top. */
	size: number;
	/** Letter spacing for the span on top. */
	gap: number;
}

/** Text metrics at 100px. */
interface Ink {
	asc: number;
	desc: number;
	left: number;
	right: number;
	width: number;
	fa: number;
	fd: number;
}

interface Ripple {
	x: number;
	y: number;
	t: number;
	reach: number;
	end: number;
}

export default function Flipdot({
	words = DEFAULT_WORDS,
	rows = 14,
	cascade = "diagonal",
	stagger = 20,
	flipDuration = 140,
	overshoot = 0.4,
	hold = 2.2,
	ripple = true,
	onColor = "#e9d5ff",
	offColor = "#1d1824",
	boardColor = "#0c0a10",
	fontFamily,
	paused = false,
	reducedMotion = false,
	className = "",
}: FlipdotProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const drawRef = useRef<((dt: number) => void | false) | null>(null);
	const resizeRef = useRef<((m: Metrics) => void) | null>(null);

	const systemStill = useSyncExternalStore(
		subscribeMotion,
		readMotion,
		readMotionOnServer,
	);
	const still = reducedMotion || systemStill;
	const font = fontFamily ?? SYSTEM_FONT;
	const custom = fontFamily !== undefined;
	// Content identity, not array identity: an inline `words={[...]}` is a new
	// array every render and must not restart the sign.
	const wordsKey = JSON.stringify(words);

	// The frame body reads props through this mirror, so tuning never rebuilds
	// the sign. Written after commit, never during render.
	const latest = {
		words,
		wordsKey,
		rows,
		cascade,
		stagger,
		flipDuration,
		overshoot,
		hold,
		ripple,
		onColor,
		offColor,
		boardColor,
		font,
		custom,
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
		onResize: (m) => resizeRef.current?.(m),
		onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
	});

	useEffect(() => {
		const root = rootRef.current;
		const canvas = canvasRef.current;
		const span = textRef.current;
		if (!root || !canvas || !span) return;
		const ctx = canvas.getContext("2d");
		const rest = document.createElement("canvas");
		const rctx = rest.getContext("2d");
		const scratch = document.createElement("canvas");
		const sctx = scratch.getContext("2d", { willReadFrequently: true });
		const probe = document.createElement("canvas");
		probe.width = 1;
		probe.height = 1;
		const pctx = probe.getContext("2d", { willReadFrequently: true });
		if (!ctx || !rctx || !sctx || !pctx) return;

		// Geometry, in device pixels.
		let bw = 0;
		let bh = 0;
		let dpr = 1;
		let pitch = 0;
		let C = 0;
		let R = 0;
		let N = 0;
		let ox = 0;
		let oy = 0;
		let layoutDirty = true;

		// Per-dot state. `val` is the word, `inv` the pointer's inversion; the
		// disc is always heading for val ^ inv, and from/to/t0/dur describe the
		// flip that is taking it there. A cascade parks the new word in
		// pendVal until pendAt, so the word only changes under a disc when the
		// sweep reaches it.
		let val = new Uint8Array(0);
		let inv = new Uint8Array(0);
		let to = new Uint8Array(0);
		let from = new Float32Array(0);
		let t0 = new Float64Array(0);
		let dur = new Float32Array(0);
		let backAt = new Float64Array(0);
		let pendAt = new Float64Array(0);
		let pendVal = new Uint8Array(0);
		/** What the cached layer holds per cell: 0 socket, 1 dark, 2 bright. */
		let shown = new Uint8Array(0);
		let movingList = new Int32Array(0);
		let jitter = new Float32Array(0);
		let spread = new Float32Array(0);
		let order = new Float32Array(0);

		// The sign's own clock. It only runs while the sign does, so a pause
		// freezes every disc mid-turn and resumes it exactly there.
		let now = 0;
		let list: string[] = [""];
		let wordIndex = 0;
		let landAt = 0;
		let cascades = 0;
		let started = false;
		let stillApplied = false;
		let contentKey = "";
		let current = "";
		let mode: "face" | "font" = "font";
		let scale = 1;
		const plates = new Map<string, Plate>();
		const inks = new Map<string, Ink>();

		// Look.
		let lookKey = "";
		let boardFill = "#000";
		let glintFill = "#fff";
		let vignette: CanvasGradient | null = null;
		let cellEmpty: HTMLCanvasElement | null = null;
		let cellOff: HTMLCanvasElement | null = null;
		let cellOn: HTMLCanvasElement | null = null;
		let discs: HTMLCanvasElement[][] = [[], []];
		const sprites: HTMLCanvasElement[] = [];
		/** A cell-sized sprite from the pool, sized and cleared. */
		const sprite = (k: number, p: number): HTMLCanvasElement => {
			let c = sprites[k];
			if (!c) {
				c = document.createElement("canvas");
				sprites[k] = c;
			}
			if (c.width !== p || c.height !== p) {
				c.width = p;
				c.height = p;
			} else {
				c.getContext("2d")?.clearRect(0, 0, p, p);
			}
			return c;
		};

		// Font gate.
		let fontFor = "";
		let fontOk = false;
		let alive = true;

		const brush = { on: false, x: 0, y: 0 };
		const ripples: Ripple[] = [];

		const allocate = (cols: number, rowCount: number) => {
			C = cols;
			R = rowCount;
			N = C * R;
			val = new Uint8Array(N);
			inv = new Uint8Array(N);
			to = new Uint8Array(N);
			from = new Float32Array(N);
			t0 = new Float64Array(N).fill(-1e9);
			dur = new Float32Array(N).fill(1);
			backAt = new Float64Array(N);
			pendAt = new Float64Array(N).fill(-1);
			pendVal = new Uint8Array(N);
			shown = new Uint8Array(N).fill(255);
			movingList = new Int32Array(N);
			jitter = new Float32Array(N);
			spread = new Float32Array(N);
			order = new Float32Array(N);
			// Seeded, so the same sign always staggers the same way.
			const rand = mulberry32(0x5eed ^ (C * 73856093) ^ (R * 19349663));
			for (let i = 0; i < N; i++) {
				jitter[i] = rand() * 2 - 1;
				spread[i] = 0.9 + rand() * 0.2;
				order[i] = rand();
			}
			plates.clear();
			ripples.length = 0;
		};

		/** Returns true when the grid itself changed shape. */
		const relayout = (): boolean => {
			layoutDirty = false;
			const L = live.current;
			const rowCount = rowCountOf(L.rows);
			const w = bw / dpr;
			const h = bh / dpr;
			// At least three columns per row, and never narrower than the longest
			// word in the dot face: a 7-row sign is 21 columns by the first rule,
			// which no six-letter word fits, and a word squeezed past its face
			// comes out as a smear.
			const longest = L.custom ? 0 : faceWidth(L.words);
			const minCols = Math.max(3 * rowCount, longest > 0 ? longest + 2 : 0);
			const css = Math.min((h * 0.86) / rowCount, (w * 0.94) / minCols);
			let p = Math.max(2, Math.round(css * dpr));
			if (p * rowCount > bh) p = Math.max(1, Math.floor(bh / rowCount));
			const cols = Math.max(1, Math.floor((bw * 0.94) / p));
			const changed = cols !== C || rowCount !== R;
			const before = `${pitch}|${ox}|${oy}|${rest.width}x${rest.height}`;
			pitch = p;
			if (changed) allocate(cols, rowCount);
			ox = Math.floor((bw - C * pitch) / 2);
			oy = Math.floor((bh - R * pitch) / 2);
			if (rest.width !== bw) rest.width = bw;
			if (rest.height !== bh) rest.height = bh;
			// Cells that moved leave old discs behind in the cached layer, so any
			// change of geometry repaints it from the board up.
			if (changed || before !== `${pitch}|${ox}|${oy}|${rest.width}x${rest.height}`) lookKey = "";
			return changed;
		};

		const look = () => {
			const L = live.current;
			const key = `${L.onColor}|${L.offColor}|${L.boardColor}|${pitch}|${bw}x${bh}`;
			if (key === lookKey) return;
			lookKey = key;
			const on = readColor(pctx, L.onColor, "#e9d5ff");
			const off = readColor(pctx, L.offColor, "#1d1824");
			const board = readColor(pctx, L.boardColor, "#0c0a10");
			const p = pitch;
			boardFill = rgb(board, 1);
			glintFill = rgb(lift(on, 0.65), 1);

			// Repainted in place: a color drag rebuilds the look every frame,
			// and fresh canvases each time would be garbage the GPU has to
			// let go of too.
			cellEmpty = sprite(0, p);
			cellOff = sprite(1, p);
			cellOn = sprite(2, p);
			paintSocket(cellEmpty, p, board);
			paintSocket(cellOff, p, board);
			paintDisc(cellOff, p, off, 1);
			paintSocket(cellOn, p, board);
			paintDisc(cellOn, p, on, 1);

			discs = [[], []];
			for (let b = 0; b < SHADES; b++) {
				const shade = 0.55 + (0.45 * b) / (SHADES - 1);
				const dark = sprite(3 + b, p);
				paintDisc(dark, p, off, shade);
				discs[0].push(dark);
				const bright = sprite(3 + SHADES + b, p);
				paintDisc(bright, p, on, shade);
				discs[1].push(bright);
			}

			// A soft pool of light on the middle of the sign. It is baked into
			// the cached layer once for the margins and once per resting cell,
			// and laid over a cell in flight after its disc is drawn, so every
			// pixel gets it exactly once and a hold frame stays a single blit.
			// The gradient lives in canvas space, so either context can use it.
			const g = ctx.createRadialGradient(bw / 2, bh * 0.46, 0, bw / 2, bh * 0.46, Math.hypot(bw, bh) * 0.6);
			g.addColorStop(0, "rgba(255,255,255,0.035)");
			g.addColorStop(0.45, "rgba(0,0,0,0)");
			g.addColorStop(1, "rgba(0,0,0,0.45)");
			vignette = g;

			rctx.setTransform(1, 0, 0, 1, 0, 0);
			rctx.fillStyle = boardFill;
			rctx.fillRect(0, 0, bw, bh);
			rctx.fillStyle = g;
			rctx.fillRect(0, 0, bw, bh);
			shown.fill(255);
		};

		/** Gate drawing on the font, so a webfont is never rasterised as its
		 *  fallback and then cached that way. */
		const fontReady = (face: string): boolean => {
			if (face === fontFor) return fontOk;
			fontFor = face;
			const spec = `${WEIGHT} 32px ${face}`;
			let ok = true;
			try {
				ok = !document.fonts || document.fonts.check(spec);
			} catch {
				ok = true;
			}
			fontOk = ok;
			if (!ok) {
				document.fonts
					.load(spec)
					.catch(() => undefined)
					.then(() => {
						if (!alive || fontFor !== face) return;
						fontOk = true;
						inks.clear();
						plates.clear();
						loop.paint();
					});
			}
			return ok;
		};

		const inkOf = (word: string, face: string): Ink => {
			const key = `${face}\n${word}`;
			let m = inks.get(key);
			if (!m) {
				sctx.font = `${WEIGHT} 100px ${face}`;
				const t = sctx.measureText(word);
				m = {
					asc: t.actualBoundingBoxAscent,
					desc: t.actualBoundingBoxDescent,
					left: t.actualBoundingBoxLeft,
					right: t.actualBoundingBoxRight,
					width: t.width,
					fa: t.fontBoundingBoxAscent || 90,
					fd: t.fontBoundingBoxDescent || 22,
				};
				if (inks.size > 256) inks.clear();
				inks.set(key, m);
			}
			return m;
		};

		/** Font scale (relative to 100px) that fits a word, before snapping. */
		const fitScale = (m: Ink): number => {
			const h = m.asc + m.desc;
			const w = m.left + m.right;
			if (!(h > 0) || !(w > 0)) return 0;
			let s = (0.74 * 4 * R) / h;
			if (w * s > 0.92 * 4 * C) s = (0.92 * 4 * C) / w;
			return s;
		};

		/** One face for the whole sign, so the words never change typeface
		 *  between themselves. */
		const pickMode = () => {
			const L = live.current;
			mode = "font";
			scale = 1;
			plates.clear();
			if (L.custom) return;
			let k = Number.POSITIVE_INFINITY;
			for (const word of list) {
				const cols = faceColumns(word);
				if (cols < 0) return;
				if (cols > 0) k = Math.min(k, Math.floor(C / cols));
			}
			k = Math.min(k, Math.floor((R >= 9 ? R - 2 : R) / 7));
			if (!(k >= 1)) return;
			let tallest = Number.POSITIVE_INFINITY;
			for (const word of list) {
				const m = inkOf(word, L.font);
				const s = fitScale(m);
				if (s > 0) tallest = Math.min(tallest, Math.floor(((m.asc + m.desc) * s) / 4));
			}
			if (tallest < FACE_BELOW) {
				mode = "face";
				scale = k;
			}
		};

		const facePlate = (word: string): Plate => {
			const bits = new Uint8Array(N);
			const cols = faceColumns(word);
			const k = scale;
			const left = Math.floor((C - cols * k) / 2);
			const top = Math.floor((R - 7 * k) / 2);
			let x = left;
			for (const ch of word.toUpperCase()) {
				const glyph = GLYPHS.get(ch);
				if (!glyph) continue;
				for (let gy = 0; gy < 7; gy++) {
					const line = glyph.bits[gy];
					for (let gx = 0; gx < glyph.w; gx++) {
						if (((line >> (glyph.w - 1 - gx)) & 1) === 0) continue;
						for (let by = 0; by < k; by++) {
							const r = top + gy * k + by;
							if (r < 0 || r >= R) continue;
							for (let bx = 0; bx < k; bx++) {
								const c = x + gx * k + bx;
								if (c >= 0 && c < C) bits[r * C + c] = 1;
							}
						}
					}
				}
				x += (glyph.w + 1) * k;
			}
			// The span on top: cap height matched to the dots, letter spacing
			// stretched to their width.
			const face = live.current.font;
			const m = inkOf(word, face);
			const cap = Math.max(1, inkOf("H", face).asc);
			const size = (7 * k * 100) / cap;
			const n = Array.from(word).length;
			const natural = (m.width * size) / 100;
			return {
				bits,
				x: left,
				base: top + 7 * k,
				size,
				gap: n > 0 ? (Math.max(0, cols) * k - natural) / n : 0,
			};
		};

		const fontPlate = (word: string): Plate => {
			const bits = new Uint8Array(N);
			const face = live.current.font;
			const m = inkOf(word, face);
			let s = fitScale(m);
			if (s <= 0) return { bits, x: C / 2, base: R / 2, size: R / 2, gap: 0 };
			const h = m.asc + m.desc;
			// Whole rows of ink, top on a row line: a flat top fills its row
			// instead of grazing two.
			const tall = Math.max(1, Math.floor((h * s) / 4));
			s = (4 * tall) / h;
			const gw = 4 * C;
			const gh = 4 * R;
			scratch.width = gw;
			scratch.height = gh;
			sctx.font = `${WEIGHT} ${100 * s}px ${face}`;
			sctx.fillStyle = "#fff";
			const top = Math.round((R - tall) / 2);
			const yb = top * 4 + m.asc * s;
			const col = Math.round((C - ((m.left + m.right) * s) / 4) / 2);
			const xo = col * 4 + m.left * s;
			sctx.fillText(word, xo, yb);
			const data = sctx.getImageData(0, 0, gw, gh).data;
			const need = 0.45 * 16 * 255;
			for (let r = 0; r < R; r++) {
				for (let c = 0; c < C; c++) {
					let sum = 0;
					for (let yy = 0; yy < 4; yy++) {
						let o = ((r * 4 + yy) * gw + c * 4) * 4 + 3;
						for (let xx = 0; xx < 4; xx++, o += 4) sum += data[o];
					}
					if (sum > need) bits[r * C + c] = 1;
				}
			}
			return { bits, x: xo / 4, base: yb / 4, size: 25 * s, gap: 0 };
		};

		const plateFor = (word: string): Plate => {
			const key = `${mode}|${scale}|${word}`;
			let plate = plates.get(key);
			if (!plate) {
				plate = mode === "face" ? facePlate(word) : fontPlate(word);
				if (plates.size > 64) plates.clear();
				plates.set(key, plate);
			}
			return plate;
		};

		const placeText = () => {
			const plate = plateFor(current);
			const px = pitch / dpr;
			const size = plate.size * px;
			const m = inkOf(current, live.current.font);
			const fa = (m.fa * size) / 100;
			const fd = (m.fd * size) / 100;
			const left = ox / dpr + plate.x * px;
			const base = oy / dpr + plate.base * px;
			// line-height is 1, so the baseline sits half the leading plus the
			// ascent below the top of the line box.
			const top = base - ((size - (fa + fd)) / 2 + fa);
			if (span.textContent !== current) span.textContent = current;
			span.style.fontSize = `${size}px`;
			span.style.letterSpacing = `${plate.gap * px}px`;
			span.style.transform = `translate(${left}px, ${top}px)`;
		};

		const valueAt = (i: number, t: number): number => {
			const u = (t - t0[i]) / dur[i];
			if (u >= 1) return to[i];
			if (u <= 0) return from[i];
			return from[i] + (to[i] - from[i]) * backOut(u, 1.7 * live.current.overshoot);
		};

		/** Send a disc toward val ^ inv, starting from wherever it is at `t`. */
		const retarget = (i: number, at: number) => {
			const target = val[i] ^ inv[i];
			if (target === to[i]) return;
			const t = at < t0[i] ? t0[i] : at;
			from[i] = valueAt(i, t);
			to[i] = target;
			t0[i] = t;
			dur[i] = Math.max(0.016, (Math.max(0, live.current.flipDuration) / 1000) * spread[i]);
		};

		const disturb = (i: number, t: number, length: number) => {
			if (inv[i] === 0) {
				inv[i] = 1;
				retarget(i, t);
				backAt[i] = t + length;
			} else if (t + length > backAt[i]) {
				backAt[i] = t + length;
			}
		};

		const brushAt = (x: number, y: number, t: number) => {
			const c0 = Math.max(0, Math.ceil(x - BRUSH));
			const c1 = Math.min(C - 1, Math.floor(x + BRUSH));
			const r0 = Math.max(0, Math.ceil(y - BRUSH));
			const r1 = Math.min(R - 1, Math.floor(y + BRUSH));
			for (let r = r0; r <= r1; r++) {
				for (let c = c0; c <= c1; c++) {
					const dx = c - x;
					const dy = r - y;
					if (dx * dx + dy * dy <= BRUSH * BRUSH) disturb(r * C + c, t, BRUSH_HOLD);
				}
			}
		};

		/** Put a word up with no animation. */
		const setWord = (word: string) => {
			const plate = plateFor(word);
			for (let i = 0; i < N; i++) {
				const b = plate.bits[i];
				val[i] = b;
				inv[i] = 0;
				to[i] = b;
				from[i] = b;
				t0[i] = -1e9;
				dur[i] = 1;
				pendAt[i] = -1;
				backAt[i] = 0;
			}
			ripples.length = 0;
			landAt = now;
			current = word;
			placeText();
		};

		/** Sweep the sign to a new word. Only discs whose value changes move. */
		const cascadeTo = (word: string) => {
			const L = live.current;
			const plate = plateFor(word);
			const s = Math.max(0, L.stagger) / 1000;
			cascades++;
			// A fresh order every time for `random`, still seeded.
			const phase = (cascades * 0.6180339887) % 1;
			const cx = (C - 1) / 2;
			const cy = (R - 1) / 2;
			let last = 0;
			for (let r = 0; r < R; r++) {
				for (let c = 0; c < C; c++) {
					const i = r * C + c;
					const target = plate.bits[i];
					if (target === val[i]) {
						pendAt[i] = -1;
						continue;
					}
					let step: number;
					if (L.cascade === "columns") step = c;
					else if (L.cascade === "radial") step = 1.4 * Math.hypot(c - cx, r - cy);
					else if (L.cascade === "random") step = ((order[i] + phase) % 1) * C * 0.7;
					else step = c + 0.6 * r;
					const delay = Math.max(0, (step + jitter[i] * 0.15) * s);
					pendAt[i] = now + delay;
					pendVal[i] = target;
					if (delay > last) last = delay;
				}
			}
			landAt = now + last + (Math.max(0, L.flipDuration) / 1000) * 1.1;
			current = word;
			placeText();
		};

		/** Advance pending flips, the pointer and the ripples. Returns whether
		 *  anything is still scheduled. */
		const step = (): boolean => {
			const L = live.current;
			let busy = false;
			for (let i = 0; i < N; i++) {
				if (pendAt[i] < 0) continue;
				if (pendAt[i] <= now) {
					const t = pendAt[i];
					pendAt[i] = -1;
					val[i] = pendVal[i];
					retarget(i, t);
				} else {
					busy = true;
				}
			}
			if (L.ripple && brush.on) brushAt(brush.x, brush.y, now);
			for (let k = ripples.length - 1; k >= 0; k--) {
				const rp = ripples[k];
				const reach = (now - rp.t) * RIPPLE_SPEED;
				if (reach > rp.reach) {
					const c0 = Math.max(0, Math.floor(rp.x - reach));
					const c1 = Math.min(C - 1, Math.ceil(rp.x + reach));
					const r0 = Math.max(0, Math.floor(rp.y - reach));
					const r1 = Math.min(R - 1, Math.ceil(rp.y + reach));
					for (let r = r0; r <= r1; r++) {
						for (let c = c0; c <= c1; c++) {
							const d = Math.hypot(c - rp.x, r - rp.y);
							if (d > rp.reach && d <= reach) {
								disturb(r * C + c, rp.t + d / RIPPLE_SPEED, RIPPLE_HOLD);
							}
						}
					}
					rp.reach = reach;
				}
				if (reach > rp.end) ripples.splice(k, 1);
			}
			for (let i = 0; i < N; i++) {
				if (inv[i] === 0) continue;
				if (backAt[i] <= now) {
					inv[i] = 0;
					retarget(i, backAt[i]);
				} else {
					busy = true;
				}
			}
			return busy || ripples.length > 0;
		};

		const stamp = (i: number, want: number) => {
			const cell = want === 2 ? cellOn : want === 1 ? cellOff : cellEmpty;
			if (!cell) return;
			const c = i % C;
			const r = (i - c) / C;
			const x = ox + c * pitch;
			const y = oy + r * pitch;
			rctx.drawImage(cell, x, y);
			// An empty socket is a disc in flight; it gets its light on the
			// frame, over the disc, instead.
			if (want !== 0 && vignette) {
				rctx.fillStyle = vignette;
				rctx.fillRect(x, y, pitch, pitch);
			}
		};

		/** Draw one frame. Returns how many discs are in flight. */
		const render = (): number => {
			let moving = 0;
			for (let i = 0; i < N; i++) {
				const inFlight = now < t0[i] + dur[i];
				const want = inFlight ? 0 : to[i] === 1 ? 2 : 1;
				if (shown[i] !== want) {
					stamp(i, want);
					shown[i] = want;
				}
				if (inFlight) movingList[moving++] = i;
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.globalAlpha = 1;
			ctx.drawImage(rest, 0, 0);

			const k = 1.7 * live.current.overshoot;
			const glintH = Math.max(1, Math.round(pitch * 0.06));
			const glintW = pitch * DISC * 1.9;
			ctx.fillStyle = glintFill;
			for (let j = 0; j < moving; j++) {
				const i = movingList[j];
				const u = (now - t0[i]) / dur[i];
				const e = u <= 0 ? 0 : backOut(u, k);
				const v = from[i] + (to[i] - from[i]) * e;
				const cs = Math.cos(v * Math.PI);
				const a = Math.abs(cs);
				const sprite = discs[cs < 0 ? 1 : 0][Math.round(a * (SHADES - 1))];
				if (!sprite) continue;
				const c = i % C;
				const r = (i - c) / C;
				const x = ox + c * pitch;
				const cy = oy + r * pitch + pitch / 2;
				const h = pitch * Math.max(a, EDGE);
				ctx.drawImage(sprite, x, cy - h / 2, pitch, h);
				if (a < GLINT) {
					// The rim catching the light as the disc passes edge-on.
					ctx.globalAlpha = (1 - a / GLINT) * 0.75;
					ctx.fillRect(x + (pitch - glintW) / 2, cy - glintH / 2, glintW, glintH);
					ctx.globalAlpha = 1;
				}
			}

			if (vignette && moving > 0) {
				ctx.fillStyle = vignette;
				for (let j = 0; j < moving; j++) {
					const i = movingList[j];
					const c = i % C;
					const r = (i - c) / C;
					ctx.fillRect(ox + c * pitch, oy + r * pitch, pitch, pitch);
				}
			}
			return moving;
		};

		drawRef.current = (dt) => {
			if (bw < 1 || bh < 1) return false;
			const L = live.current;
			const key = `${L.wordsKey}\n${L.font}\n${L.custom ? 1 : 0}`;
			const fresh = !started || key !== contentKey;
			// New words can need a wider sign, so they re-run the layout too.
			if (fresh) layoutDirty = true;
			let regrid = false;
			if (layoutDirty || rowCountOf(L.rows) !== R) {
				regrid = relayout();
				if (started && !regrid && !fresh) placeText();
			}
			if (N === 0) return false;
			look();

			// Nothing goes up until the face it is drawn in has loaded. The
			// board shows meanwhile, and the load paints the sign awake.
			if (!fontReady(L.font)) {
				render();
				return false;
			}

			if (fresh) {
				started = true;
				contentKey = key;
				list = L.words.length > 0 ? L.words.map((w) => String(w)) : [""];
				pickMode();
				wordIndex = 0;
				// Halted signs get the word straight away: a paused board that
				// sits empty until someone presses play has hidden its content.
				if (L.still || L.paused) setWord(list[0]);
				else cascadeTo(list[0]);
			} else if (regrid) {
				// A new grid gets the current word as it stands. Re-sweeping the
				// whole board on every step of a slider drag is a flip storm.
				pickMode();
				setWord(list[wordIndex] ?? list[0]);
			}

			let busy = false;
			if (L.still) {
				if (!stillApplied) {
					stillApplied = true;
					brush.on = false;
					setWord(list[wordIndex] ?? list[0]);
				}
			} else {
				stillApplied = false;
				now += dt;
				if (list.length > 1 && now >= landAt + Math.max(0, L.hold)) {
					wordIndex = (wordIndex + 1) % list.length;
					cascadeTo(list[wordIndex]);
				}
				busy = step();
			}

			const moving = render();

			// A one-word sign has nothing scheduled once it settles, so it stops
			// asking for frames. The pointer and any prop change wake it.
			if (list.length < 2 && moving === 0 && !busy && !brush.on) return false;
		};

		resizeRef.current = (m) => {
			// The grid is snapped to whole device pixels, so drawing happens in
			// device space and the transform stays identity. dpr enters through
			// the pitch instead.
			if (canvas.width !== m.bufferWidth) canvas.width = m.bufferWidth;
			if (canvas.height !== m.bufferHeight) canvas.height = m.bufferHeight;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			bw = m.bufferWidth;
			bh = m.bufferHeight;
			dpr = m.width > 0 ? m.bufferWidth / m.width : m.dpr;
			layoutDirty = true;
		};

		/** Pointer position in dot coordinates (dot centres on integers). */
		const toDots = (e: PointerEvent): [number, number] | null => {
			const rect = root.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0 || pitch <= 0) return null;
			const x = (e.clientX - rect.left) * (bw / rect.width);
			const y = (e.clientY - rect.top) * (bh / rect.height);
			return [(x - ox) / pitch - 0.5, (y - oy) / pitch - 0.5];
		};

		const interactive = () => {
			const L = live.current;
			return started && N > 0 && L.ripple && !L.paused && !L.still;
		};

		const onMove = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return;
			if (!interactive()) {
				brush.on = false;
				return;
			}
			const pt = toDots(e);
			if (!pt) return;
			if (brush.on) {
				// Stamp along the path, so a fast sweep leaves no gaps.
				const dx = pt[0] - brush.x;
				const dy = pt[1] - brush.y;
				const steps = Math.min(400, Math.ceil(Math.hypot(dx, dy) / 0.5));
				for (let s = 1; s <= steps; s++) {
					brushAt(brush.x + (dx * s) / steps, brush.y + (dy * s) / steps, now);
				}
			} else {
				brushAt(pt[0], pt[1], now);
			}
			brush.on = true;
			brush.x = pt[0];
			brush.y = pt[1];
			loop.start();
		};

		const onLeave = () => {
			brush.on = false;
		};

		const onDown = (e: PointerEvent) => {
			if (!interactive()) return;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			const pt = toDots(e);
			if (!pt) return;
			if (ripples.length >= MAX_RIPPLES) ripples.shift();
			const far = Math.max(
				Math.hypot(pt[0], pt[1]),
				Math.hypot(C - 1 - pt[0], pt[1]),
				Math.hypot(pt[0], R - 1 - pt[1]),
				Math.hypot(C - 1 - pt[0], R - 1 - pt[1]),
			);
			ripples.push({ x: pt[0], y: pt[1], t: now, reach: -1, end: far + 1 });
			loop.start();
		};

		root.addEventListener("pointermove", onMove);
		root.addEventListener("pointerleave", onLeave);
		root.addEventListener("pointercancel", onLeave);
		root.addEventListener("pointerdown", onDown);

		loop.resize();
		loop.start();

		return () => {
			alive = false;
			drawRef.current = null;
			resizeRef.current = null;
			root.removeEventListener("pointermove", onMove);
			root.removeEventListener("pointerleave", onLeave);
			root.removeEventListener("pointercancel", onLeave);
			root.removeEventListener("pointerdown", onDown);
			// Hand the offscreen memory back now rather than at the next GC:
			// Safari caps total canvas memory per page, and previews come and go.
			for (const c of [rest, scratch, probe, ...sprites]) {
				c.width = 0;
				c.height = 0;
			}
		};
	}, [loop]);

	// Tuning while halted still repaints: colors, rows and words all show on a
	// paused sign.
	useEffect(() => {
		loop.paint();
	}, [
		loop,
		wordsKey,
		rows,
		cascade,
		stagger,
		flipDuration,
		overshoot,
		hold,
		ripple,
		onColor,
		offColor,
		boardColor,
		font,
		paused,
		still,
	]);

	return (
		<div
			ref={rootRef}
			className={`relative h-full w-full overflow-hidden ${className}`.trim()}
		>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				className="absolute inset-0 block size-full"
			/>
			<span
				ref={textRef}
				className="absolute top-0 left-0 leading-none font-extrabold whitespace-nowrap text-transparent select-text"
				style={{ fontFamily: font }}
			>
				{words[0] ?? ""}
			</span>
		</div>
	);
}

/** Columns a word takes in the dot face, or -1 if it has a glyph the face
 *  does not. */
function faceColumns(word: string): number {
	let cols = 0;
	let n = 0;
	for (const ch of word.toUpperCase()) {
		const glyph = GLYPHS.get(ch);
		if (!glyph) return -1;
		cols += glyph.w + (n > 0 ? 1 : 0);
		n++;
	}
	return cols;
}

/** Columns the longest word needs in the dot face, or 0 if any word can't be
 *  set in it. */
function faceWidth(list: string[]): number {
	let most = 0;
	for (const word of list) {
		const cols = faceColumns(String(word));
		if (cols < 0) return 0;
		if (cols > most) most = cols;
	}
	return most;
}

function rowCountOf(value: number): number {
	return Number.isFinite(value) ? Math.max(1, Math.min(64, Math.round(value))) : 14;
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

function decodeFace(face: Record<string, string>): Map<string, Glyph> {
	const out = new Map<string, Glyph>();
	for (const ch of Object.keys(face)) {
		const code = face[ch];
		out.set(ch, {
			w: parseInt(code.charAt(0), 10),
			bits: Array.from(code.slice(1), (digit) => parseInt(digit, 32)),
		});
	}
	return out;
}

/** Ease out past the end and back. `s` is the overshoot. */
function backOut(t: number, s: number): number {
	const u = t - 1;
	return 1 + (s + 1) * u * u * u + s * u * u;
}

/** Deterministic PRNG: the same seed always gives the same sign. */
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
function readColor(probe: CanvasRenderingContext2D, value: string, fallback: string): RGB {
	probe.fillStyle = fallback;
	probe.fillStyle = value;
	probe.clearRect(0, 0, 1, 1);
	probe.fillRect(0, 0, 1, 1);
	const d = probe.getImageData(0, 0, 1, 1).data;
	return [d[0], d[1], d[2]];
}

function rgb(c: RGB, k: number): string {
	return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
}

function lift(c: RGB, k: number): RGB {
	return [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
}

function sink(c: RGB, k: number): RGB {
	return [c[0] * (1 - k), c[1] * (1 - k), c[2] * (1 - k)];
}

/** One empty cell: the board, and the hole a disc sits in. */
function paintSocket(cell: HTMLCanvasElement, p: number, board: RGB) {
	const g = cell.getContext("2d");
	if (!g) return;
	const c = p / 2;
	const r = SOCKET * p;
	g.fillStyle = rgb(board, 1);
	g.fillRect(0, 0, p, p);
	const hole = g.createLinearGradient(0, c - r, 0, c + r);
	hole.addColorStop(0, rgb(board, 0.2));
	hole.addColorStop(1, rgb(board, 0.55));
	g.fillStyle = hole;
	g.beginPath();
	g.arc(c, c, r, 0, Math.PI * 2);
	g.fill();
	if (p >= 8) {
		// The lower lip of the socket catches the light.
		const lw = Math.max(1, p * 0.035);
		g.strokeStyle = rgb(lift(board, 0.16), 1);
		g.globalAlpha = 0.6;
		g.lineWidth = lw;
		g.beginPath();
		g.arc(c, c, r - lw / 2, Math.PI * 0.18, Math.PI * 0.82);
		g.stroke();
		g.globalAlpha = 1;
	}
}

/** One disc face, centred in a cell-sized sprite, darkened by `shade`. */
function paintDisc(cell: HTMLCanvasElement, p: number, face: RGB, shade: number) {
	const g = cell.getContext("2d");
	if (!g) return;
	const c = p / 2;
	const r = DISC * p;
	const fill = g.createLinearGradient(0, c - r, 0, c + r);
	fill.addColorStop(0, rgb(lift(face, 0.14), shade));
	fill.addColorStop(1, rgb(sink(face, 0.18), shade));
	g.fillStyle = fill;
	g.beginPath();
	g.arc(c, c, r, 0, Math.PI * 2);
	g.fill();
	if (p >= 6) {
		const lw = Math.max(0.75, p * 0.03);
		g.strokeStyle = rgb(sink(face, 0.45), shade);
		g.globalAlpha = 0.55;
		g.lineWidth = lw;
		g.beginPath();
		g.arc(c, c, r - lw / 2, 0, Math.PI * 2);
		g.stroke();
		g.globalAlpha = 1;
	}
}
