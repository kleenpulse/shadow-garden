import { anchorFor, SECTION_IDS } from "@/components/landing/data";

// The cube's itinerary down the landing page, as waypoints keyed on real
// section ids rather than fractions of the document. Anchored nodes survive
// content changes: a longer exhibit list moves the anchor, not the cube's
// relationship to it. Positions are % of the viewport; scale and opacity are
// relative to the hero's own cube box; azimuth/elevation are added to the
// orbit rig on top of whatever a drag has done.
/** Pseudo-anchor for the end of the document (the maximum scroll position). The
 *  footer is shorter than a viewport, so no element edge can name "the page
 *  cannot scroll any further" — and that is exactly where the route resolves. */
export const ROUTE_END = "$end";

export interface RouteNode {
	/** An element id, or ROUTE_END. */
	anchor: string;
	/** Which edge of the anchored element the node sits on. Default "top". */
	at?: "top" | "bottom";
	/** Added to the anchored edge, in viewport heights. A node is reached when
	 *  that document position hits the top of the viewport, so a section's
	 *  pose lands as the section itself comes into view with a negative offset
	 *  rather than after the visitor has already read it. */
	offsetVh?: number;
	/** Cube centre. "rest" = the measured hero box, so scroll 0 is the classic hero. */
	x: number | "rest";
	y: number | "rest";
	scale: number;
	opacity: number;
	azimuth: number;
	elevation: number;
}

export interface Pose {
	x: number;
	y: number;
	scale: number;
	opacity: number;
	azimuth: number;
	elevation: number;
}

/** Per-frame easing rate toward the route target (1/s). */
export const ROUTE_DAMP = 7;
/** Lenis velocity (px per step, not px/s) that reads as a "fast" scroll. */
export const V_REF = 40;
/** Fixed seed: every visitor scrubs the same scramble, and a reload reproduces it. */
export const SCRUB_SEED = 0x5ade;

const TAU = Math.PI * 2;

export const TRAVELER_ROUTE: readonly RouteNode[] = [
	// Identical opening — the traveler and the classic hero share one box (the
	// traveler only washes the grid behind it).
	{ anchor: SECTION_IDS.hero, x: "rest", y: "rest", scale: 1, opacity: 1, azimuth: 0, elevation: 0 },
	// Half a viewport in, the classic recede value: the hero copy is leaving
	// and the cube lags it, which is the parallax that sells the hand-off.
	{ anchor: SECTION_IDS.manifesto, offsetVh: -0.5, x: 66, y: 38, scale: 0.7, opacity: 1, azimuth: 0.25, elevation: 0 },
	// Across the exhibits it is a dim watermark hugging one edge: the plates
	// are opaque and the copy columns are wide, so it lives in the margins,
	// crossing sides so the eye has somewhere new to find it each time.
	{ anchor: anchorFor("Backgrounds"), offsetVh: -0.25, x: 88, y: 80, scale: 0.45, opacity: 0.55, azimuth: 0.6, elevation: 0.1 },
	{ anchor: anchorFor("Text Animations"), offsetVh: -0.5, x: 10, y: 76, scale: 0.4, opacity: 0.5, azimuth: 1.0, elevation: 0.05 },
	{ anchor: anchorFor("Power-User Systems"), offsetVh: -0.5, x: 90, y: 70, scale: 0.42, opacity: 0.5, azimuth: 1.5, elevation: 0 },
	// Second arrival. The section ends in its index rows — glass slats under
	// the scroll hero — so the cube comes forward behind them, right of the
	// names, then recedes again into Micro-interactions.
	{ anchor: anchorFor("Power-User Systems"), at: "bottom", offsetVh: -0.95, x: 74, y: 52, scale: 0.85, opacity: 0.9, azimuth: 1.75, elevation: 0.06 },
	{ anchor: anchorFor("Micro-interactions"), offsetVh: -0.5, x: 9, y: 72, scale: 0.38, opacity: 0.45, azimuth: 2.0, elevation: -0.05 },
	{ anchor: anchorFor("Hero Templates"), offsetVh: -0.5, x: 88, y: 74, scale: 0.45, opacity: 0.55, azimuth: 2.5, elevation: 0 },
	// Calibration is the "tune it" beat — the cube comes back as the subject.
	{ anchor: SECTION_IDS.calibration, offsetVh: -0.5, x: 78, y: 55, scale: 0.85, opacity: 0.9, azimuth: 2.9, elevation: 0.08 },
	// The sealed archive is a full-bleed plate, thinned to 72% in these
	// variants (globals.css), so the cube ghosts through it at its final spot
	// and the return below is a pure fade-up. Were it ever opaque again, drop
	// this opacity to 0 and CubeTraveler parks the frameloop on its own.
	{ anchor: SECTION_IDS.sealed, offsetVh: -0.35, x: 44, y: 84, scale: 0.38, opacity: 0.7, azimuth: Math.PI, elevation: 0 },
	// The footer is under a viewport tall, so at the end of the document it is
	// a strip along the bottom with an empty middle column. The cube lands
	// there, small, azimuth wrapped back to rest and the scramble solved: the
	// page resolves and holds.
	{ anchor: ROUTE_END, x: 44, y: 84, scale: 0.38, opacity: 1, azimuth: TAU, elevation: 0 },
];

const smooth = (t: number) => {
	const x = t < 0 ? 0 : t > 1 ? 1 : t;
	return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface RouteFrame {
	/** Document y of each node, parallel to `nodes`. */
	tops: number[];
	nodes: RouteNode[];
	/** The hero box's centre, in viewport px. */
	rest: { x: number; y: number };
	vw: number;
	vh: number;
	mirror: boolean;
}

function resolve(node: RouteNode, f: RouteFrame, out: Pose): Pose {
	out.x =
		node.x === "rest"
			? f.rest.x
			: ((f.mirror ? 100 - node.x : node.x) / 100) * f.vw;
	out.y = node.y === "rest" ? f.rest.y : (node.y / 100) * f.vh;
	out.scale = node.scale;
	out.opacity = node.opacity;
	out.azimuth = node.azimuth;
	out.elevation = node.elevation;
	return out;
}

const _a: Pose = { x: 0, y: 0, scale: 1, opacity: 1, azimuth: 0, elevation: 0 };
const _b: Pose = { x: 0, y: 0, scale: 1, opacity: 1, azimuth: 0, elevation: 0 };

/** Segment lookup + smoothstep between the two neighbouring nodes, clamped at
 *  both ends. Writes into `out` so the per-frame caller allocates nothing. */
export function sampleRoute(scroll: number, f: RouteFrame, out: Pose): Pose {
	const n = f.nodes.length;
	if (n === 0) return out;
	if (n === 1 || scroll <= f.tops[0]) return resolve(f.nodes[0], f, out);
	if (scroll >= f.tops[n - 1]) return resolve(f.nodes[n - 1], f, out);
	let i = 0;
	while (i < n - 2 && scroll >= f.tops[i + 1]) i++;
	const span = Math.max(1, f.tops[i + 1] - f.tops[i]);
	const t = smooth((scroll - f.tops[i]) / span);
	resolve(f.nodes[i], f, _a);
	resolve(f.nodes[i + 1], f, _b);
	out.x = lerp(_a.x, _b.x, t);
	out.y = lerp(_a.y, _b.y, t);
	out.scale = lerp(_a.scale, _b.scale, t);
	out.opacity = lerp(_a.opacity, _b.opacity, t);
	out.azimuth = lerp(_a.azimuth, _b.azimuth, t);
	out.elevation = lerp(_a.elevation, _b.elevation, t);
	return out;
}
