"use client";

/**
 * PhysicsEngine — a from-scratch 2D rigid-body physics lab on a blueprint grid.
 *
 * Everything on screen is real, computed physics — nothing is keyframed:
 * - Fixed-timestep integration at 120 Hz with an accumulator; rendering
 *   interpolates between the last two states, so frame rate never changes
 *   the simulation outcome.
 * - Semi-implicit (symplectic) Euler, impulse-based contact solver with
 *   accumulated impulses, warm starting and Baumgarte position correction
 *   (the Box2D-lite recipe), restitution + Coulomb friction.
 * - SI units throughout: positions in meters (48 px = 1 m), masses in kg
 *   derived from shape area × density, energies in joules. The HUD reads
 *   straight from solver state.
 * - Deterministic: scenes build from a fixed seed, so a reload replays
 *   identically.
 *
 * Deliberate simplifications for a ≤40-body showcase (documented, honest):
 * no continuous collision detection (bounds are 1 m thick and speeds are
 * clamped instead), and an O(n²) AABB broadphase (≤ ~800 cheap tests/step).
 */

import { memo, useEffect, useRef, useState } from "react";

/* ================================================================
 * 1 · Constants
 * ============================================================== */

const DT = 1 / 120; // fixed physics timestep (s)
const MAX_STEPS_PER_FRAME = 10; // then drop backlog — no spiral of death
const MAX_FRAME_DELTA = 0.25; // s, clamp tab-switch deltas
const SCALE = 48; // px per meter

const VELOCITY_ITERATIONS = 10;
const BETA = 0.2; // Baumgarte position-correction factor — never raise past 0.2 (injects energy)
const SLOP = 0.005; // m of tolerated penetration
const RESTITUTION_THRESHOLD = 1; // m/s — impacts slower than this don't bounce, so stacks settle
// Rolling resistance stand-in: without it a circle in pure-Coulomb contact
// rolls forever (no slip → no tangential impulse). Real engines ship the same.
const ANGULAR_DAMPING = 0.4; // 1/s

const SLEEP_LIN = 0.05; // m/s
const SLEEP_ANG = 0.2; // rad/s — must catch slow rollers (v = ω·r stays under SLEEP_LIN)
const SLEEP_TIME = 0.5; // s below thresholds before a body sleeps
const WAKE_SPEED = 0.15; // m/s — a mover this fast wakes sleepers it touches

const MAX_SPEED = 40; // m/s hard clamp (tunneling guard, no CCD)
const WALL = 1; // m — thickness of the sealed static bounds
const CEIL_Y = -7.5; // m — ceiling inner face, above the off-screen spawn zone

const TRAIL_MAX = 48; // points per body
const TRAIL_EVERY = 5; // sample every N steps (≈2 s of history)
const TRAIL_TTL = 480; // steps (4 s) — old points evaporate so settled scenes end up clean

const GRAB_HZ = 5; // mouse-spring frequency
const GRAB_ZETA = 0.7; // damping ratio
const GRAB_MAX_FORCE = 1000; // N per kg of grabbed mass

const SEED = 0x5eed; // fixed scene seed — determinism is a feature

const VEL_COLOR = "#4ade80"; // velocity arrows (solid)
const FORCE_COLOR = "#f87171"; // net-force arrows (dashed)
const ARROW_MAX = 90; // px cap on overlay arrows

/* ================================================================
 * 2 · Seeded PRNG (mulberry32) — deterministic scene builds
 * ============================================================== */

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* ================================================================
 * 3 · Bodies — mass and inertia always derive from geometry × density
 * ============================================================== */

interface Body {
	id: number;
	kind: "circle" | "box";
	r: number; // circle radius (m); 0 for boxes
	hw: number; // box half extents (m); 0 for circles
	hh: number;
	density: number;
	px: number;
	py: number;
	angle: number;
	vx: number;
	vy: number;
	w: number; // angular velocity (rad/s)
	// previous-step state, for render interpolation
	ppx: number;
	ppy: number;
	pangle: number;
	// velocity before this step's force integration — restitution must bounce
	// off true impact speed, not impact speed + g·dt, or e=1 gains energy forever
	pgvx: number;
	pgvy: number;
	pgw: number;
	mass: number;
	inertia: number;
	invMass: number;
	invI: number;
	isStatic: boolean;
	asleep: boolean;
	sleepTime: number;
	trail: number[]; // flat [x,y,stepStamp,…] ring, capped at TRAIL_MAX points
	fEmaX: number; // smoothed net force (display only)
	fEmaY: number;
	tag?: string;
}

function baseBody(kind: Body["kind"]): Body {
	return {
		id: 0,
		kind,
		r: 0,
		hw: 0,
		hh: 0,
		density: 1,
		px: 0,
		py: 0,
		angle: 0,
		vx: 0,
		vy: 0,
		w: 0,
		ppx: 0,
		ppy: 0,
		pangle: 0,
		pgvx: 0,
		pgvy: 0,
		pgw: 0,
		mass: 0,
		inertia: 0,
		invMass: 0,
		invI: 0,
		isStatic: false,
		asleep: false,
		sleepTime: 0,
		trail: [],
		fEmaX: 0,
		fEmaY: 0,
	};
}

export function makeCircle(x: number, y: number, r: number, density: number): Body {
	const b = baseBody("circle");
	b.px = b.ppx = x;
	b.py = b.ppy = y;
	b.r = r;
	b.density = density;
	b.mass = density * Math.PI * r * r;
	b.inertia = 0.5 * b.mass * r * r;
	b.invMass = 1 / b.mass;
	b.invI = 1 / b.inertia;
	return b;
}

export function makeBox(x: number, y: number, w: number, h: number, angle: number, density: number): Body {
	const b = baseBody("box");
	b.px = b.ppx = x;
	b.py = b.ppy = y;
	b.angle = b.pangle = angle;
	b.hw = w / 2;
	b.hh = h / 2;
	b.density = density;
	b.mass = density * w * h;
	b.inertia = (b.mass * (w * w + h * h)) / 12;
	b.invMass = 1 / b.mass;
	b.invI = 1 / b.inertia;
	return b;
}

function makeStatic(x: number, y: number, w: number, h: number): Body {
	const b = makeBox(x, y, w, h, 0, 1);
	b.isStatic = true;
	b.invMass = 0;
	b.invI = 0;
	return b;
}

function wake(b: Body) {
	if (b.isStatic) return;
	b.asleep = false;
	b.sleepTime = 0;
}

function bodyAABB(b: Body, out: { minX: number; minY: number; maxX: number; maxY: number }) {
	if (b.kind === "circle") {
		out.minX = b.px - b.r;
		out.maxX = b.px + b.r;
		out.minY = b.py - b.r;
		out.maxY = b.py + b.r;
	} else {
		const c = Math.abs(Math.cos(b.angle));
		const s = Math.abs(Math.sin(b.angle));
		const ex = c * b.hw + s * b.hh;
		const ey = s * b.hw + c * b.hh;
		out.minX = b.px - ex;
		out.maxX = b.px + ex;
		out.minY = b.py - ey;
		out.maxY = b.py + ey;
	}
}

/* ================================================================
 * 4 · Narrow phase — manifolds with contact points + feature ids
 *     Convention: the normal always points from body A toward body B.
 * ============================================================== */

interface Contact {
	px: number; // world contact point (m)
	py: number;
	pen: number; // penetration depth (m, > 0)
	fid: number; // stable feature id — the warm-starting key
	// solver scratch, filled by prestep:
	rax: number;
	ray: number;
	rbx: number;
	rby: number;
	massN: number;
	massT: number;
	bias: number;
	jn: number; // accumulated normal impulse
	jt: number; // accumulated tangent impulse
}

interface Manifold {
	a: Body;
	b: Body;
	nx: number;
	ny: number;
	contacts: Contact[];
}

function newContact(px: number, py: number, pen: number, fid: number): Contact {
	return { px, py, pen, fid, rax: 0, ray: 0, rbx: 0, rby: 0, massN: 0, massT: 0, bias: 0, jn: 0, jt: 0 };
}

function circleCircle(a: Body, b: Body): Manifold | null {
	const dx = b.px - a.px;
	const dy = b.py - a.py;
	const rSum = a.r + b.r;
	const d2 = dx * dx + dy * dy;
	if (d2 >= rSum * rSum) return null;
	const dist = Math.sqrt(d2);
	let nx = 0;
	let ny = -1;
	if (dist > 1e-9) {
		nx = dx / dist;
		ny = dy / dist;
	}
	const pen = rSum - dist;
	const cx = a.px + nx * (a.r - pen * 0.5);
	const cy = a.py + ny * (a.r - pen * 0.5);
	return { a, b, nx, ny, contacts: [newContact(cx, cy, pen, 0)] };
}

/** a is always the circle, b the box. */
function circleBox(a: Body, b: Body): Manifold | null {
	const c = Math.cos(b.angle);
	const s = Math.sin(b.angle);
	const dx = a.px - b.px;
	const dy = a.py - b.py;
	// circle center in box-local space
	const lx = c * dx + s * dy;
	const ly = -s * dx + c * dy;
	const cx = Math.max(-b.hw, Math.min(b.hw, lx));
	const cy = Math.max(-b.hh, Math.min(b.hh, ly));

	let pen: number;
	let lnx: number; // local direction that pushes the circle out of the box
	let lny: number;
	let pxl = cx;
	let pyl = cy;

	if (cx === lx && cy === ly) {
		// center inside the box — escape along the shallowest face
		const dxp = b.hw - lx;
		const dxn = b.hw + lx;
		const dyp = b.hh - ly;
		const dyn = b.hh + ly;
		const m = Math.min(dxp, dxn, dyp, dyn);
		if (m === dxp) {
			lnx = 1;
			lny = 0;
			pxl = b.hw;
		} else if (m === dxn) {
			lnx = -1;
			lny = 0;
			pxl = -b.hw;
		} else if (m === dyp) {
			lnx = 0;
			lny = 1;
			pyl = b.hh;
		} else {
			lnx = 0;
			lny = -1;
			pyl = -b.hh;
		}
		pen = m + a.r;
	} else {
		const ddx = lx - cx;
		const ddy = ly - cy;
		const d2 = ddx * ddx + ddy * ddy;
		if (d2 >= a.r * a.r) return null;
		const dist = Math.sqrt(d2) || 1e-9;
		lnx = ddx / dist;
		lny = ddy / dist;
		pen = a.r - dist;
	}

	// back to world: push-out direction points toward the circle, so the
	// manifold normal (A=circle → B=box) is its negation.
	const wx = c * lnx - s * lny;
	const wy = s * lnx + c * lny;
	const cpx = b.px + c * pxl - s * pyl;
	const cpy = b.py + s * pxl + c * pyl;
	return { a, b, nx: -wx, ny: -wy, contacts: [newContact(cpx, cpy, pen, 0)] };
}

/* --- box vs box: SAT + reference/incident face clipping (Box2D-lite) --- */

interface ClipVertex {
	x: number;
	y: number;
	fid: number;
}

function clipSegment(vIn: ClipVertex[], nx: number, ny: number, offset: number, clipId: number): ClipVertex[] {
	const out: ClipVertex[] = [];
	const d0 = nx * vIn[0].x + ny * vIn[0].y - offset;
	const d1 = nx * vIn[1].x + ny * vIn[1].y - offset;
	if (d0 <= 0) out.push(vIn[0]);
	if (d1 <= 0) out.push(vIn[1]);
	if (d0 * d1 < 0) {
		const t = d0 / (d0 - d1);
		out.push({
			x: vIn[0].x + t * (vIn[1].x - vIn[0].x),
			y: vIn[0].y + t * (vIn[1].y - vIn[0].y),
			fid: clipId,
		});
	}
	return out;
}

/** The two vertices of the incident box's face most anti-parallel to the reference normal. */
function incidentEdge(box: Body, fnx: number, fny: number): ClipVertex[] {
	const c = Math.cos(box.angle);
	const s = Math.sin(box.angle);
	// reference normal in incident-local space, negated
	const nx = -(c * fnx + s * fny);
	const ny = -(-s * fnx + c * fny);
	let v1x: number, v1y: number, v2x: number, v2y: number, face: number;
	if (Math.abs(nx) > Math.abs(ny)) {
		if (nx >= 0) {
			face = 0;
			v1x = box.hw;
			v1y = -box.hh;
			v2x = box.hw;
			v2y = box.hh;
		} else {
			face = 1;
			v1x = -box.hw;
			v1y = box.hh;
			v2x = -box.hw;
			v2y = -box.hh;
		}
	} else if (ny >= 0) {
		face = 2;
		v1x = box.hw;
		v1y = box.hh;
		v2x = -box.hw;
		v2y = box.hh;
	} else {
		face = 3;
		v1x = -box.hw;
		v1y = -box.hh;
		v2x = box.hw;
		v2y = -box.hh;
	}
	return [
		{ x: box.px + c * v1x - s * v1y, y: box.py + s * v1x + c * v1y, fid: face * 4 },
		{ x: box.px + c * v2x - s * v2y, y: box.py + s * v2x + c * v2y, fid: face * 4 + 1 },
	];
}

function boxBox(a: Body, b: Body): Manifold | null {
	const ca = Math.cos(a.angle);
	const sa = Math.sin(a.angle);
	const cb = Math.cos(b.angle);
	const sb = Math.sin(b.angle);
	const dpx = b.px - a.px;
	const dpy = b.py - a.py;
	// dp in each box's local frame
	const dAx = ca * dpx + sa * dpy;
	const dAy = -sa * dpx + ca * dpy;
	const dBx = cb * dpx + sb * dpy;
	const dBy = -sb * dpx + cb * dpy;
	// |C| where C = RotAᵀ·RotB — projections of one box's axes onto the other's
	const cd = Math.abs(ca * cb + sa * sb);
	const sd = Math.abs(sa * cb - ca * sb);

	// SAT: face separations (any > 0 → separated)
	const fA0 = Math.abs(dAx) - a.hw - (cd * b.hw + sd * b.hh);
	if (fA0 > 0) return null;
	const fA1 = Math.abs(dAy) - a.hh - (sd * b.hw + cd * b.hh);
	if (fA1 > 0) return null;
	const fB0 = Math.abs(dBx) - b.hw - (cd * a.hw + sd * a.hh);
	if (fB0 > 0) return null;
	const fB1 = Math.abs(dBy) - b.hh - (sd * a.hw + cd * a.hh);
	if (fB1 > 0) return null;

	// pick the min-penetration axis, biased toward the current one for coherence
	let axis = 0;
	let sep = fA0;
	let nx = dAx > 0 ? ca : -ca;
	let ny = dAx > 0 ? sa : -sa;
	if (fA1 > 0.95 * sep + 0.01 * a.hh) {
		axis = 1;
		sep = fA1;
		nx = dAy > 0 ? -sa : sa;
		ny = dAy > 0 ? ca : -ca;
	}
	if (fB0 > 0.95 * sep + 0.01 * b.hw) {
		axis = 2;
		sep = fB0;
		nx = dBx > 0 ? cb : -cb;
		ny = dBx > 0 ? sb : -sb;
	}
	if (fB1 > 0.95 * sep + 0.01 * b.hh) {
		axis = 3;
		sep = fB1;
		nx = dBy > 0 ? -sb : sb;
		ny = dBy > 0 ? cb : -cb;
	}

	// reference face setup (front plane + two side planes), incident box
	let fnx: number, fny: number, front: number, snx: number, sny: number;
	let negSide: number, posSide: number;
	let inc: Body;
	let flip: boolean;
	if (axis === 0 || axis === 1) {
		fnx = nx;
		fny = ny;
		inc = b;
		flip = false;
		front = a.px * fnx + a.py * fny + (axis === 0 ? a.hw : a.hh);
		if (axis === 0) {
			snx = -sa;
			sny = ca;
		} else {
			snx = ca;
			sny = sa;
		}
		const side = a.px * snx + a.py * sny;
		const h = axis === 0 ? a.hh : a.hw;
		negSide = -side + h;
		posSide = side + h;
	} else {
		fnx = -nx;
		fny = -ny;
		inc = a;
		flip = true;
		front = b.px * fnx + b.py * fny + (axis === 2 ? b.hw : b.hh);
		if (axis === 2) {
			snx = -sb;
			sny = cb;
		} else {
			snx = cb;
			sny = sb;
		}
		const side = b.px * snx + b.py * sny;
		const h = axis === 2 ? b.hh : b.hw;
		negSide = -side + h;
		posSide = side + h;
	}

	let pts = incidentEdge(inc, fnx, fny);
	pts = clipSegment(pts, -snx, -sny, negSide, 16);
	if (pts.length < 2) return null;
	pts = clipSegment(pts, snx, sny, posSide, 17);
	if (pts.length < 2) return null;

	const contacts: Contact[] = [];
	for (let i = 0; i < 2; i++) {
		const v = pts[i];
		const separation = fnx * v.x + fny * v.y - front;
		if (separation <= 0) {
			contacts.push(
				newContact(v.x - separation * fnx, v.y - separation * fny, -separation, v.fid + (flip ? 500 : 0)),
			);
		}
	}
	if (contacts.length === 0) return null;
	return { a, b, nx, ny, contacts };
}

function collide(a: Body, b: Body): Manifold | null {
	if (a.kind === "circle" && b.kind === "circle") return circleCircle(a, b);
	if (a.kind === "circle" && b.kind === "box") return circleBox(a, b);
	if (a.kind === "box" && b.kind === "circle") return circleBox(b, a);
	return boxBox(a, b);
}

/* ================================================================
 * 5 · Joints — rigid distance rod (wrecking ball) + mouse grab spring
 * ============================================================== */

interface DistanceJoint {
	body: Body;
	ax: number; // fixed world anchor
	ay: number;
	lx: number; // anchor in body-local space
	ly: number;
	len: number;
	// prestep scratch
	rx: number;
	ry: number;
	nx: number;
	ny: number;
	effMass: number;
	bias: number;
}

interface MouseSpring {
	body: Body;
	lx: number;
	ly: number;
	tx: number; // world target (the cursor)
	ty: number;
}

/* ================================================================
 * 6 · World — fixed-step pipeline with sleeping, energy tally, trails
 * ============================================================== */

export type PhysicsScene = "playground" | "stack" | "wrecking-ball" | "projectile";

interface StepParams {
	gravity: number;
	restitution: number;
	friction: number;
	trailsOn: boolean;
	noRespawn: boolean;
}

export class World {
	bodies: Body[] = [];
	joints: DistanceJoint[] = [];
	grab: MouseSpring | null = null;
	scene: PhysicsScene;
	worldW: number;
	worldH: number;
	floorY: number;
	launch = { x: 0, y: 0, vx: 0, vy: 0 }; // projectile respawn state
	ke = 0;
	pe = 0;
	steps = 0;
	private nextId = 1;
	private impulses = new Map<number, { jn: number; jt: number }>(); // warm-start store
	private aabbA = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	private aabbB = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

	constructor(worldW: number, worldH: number, scene: PhysicsScene) {
		this.worldW = worldW;
		this.worldH = worldH;
		this.scene = scene;
		this.floorY = worldH - 0.35;
	}

	add(b: Body): Body {
		b.id = this.nextId++;
		this.bodies.push(b);
		return b;
	}

	wakeAll() {
		for (const b of this.bodies) wake(b);
	}

	step(p: StepParams) {
		const bodies = this.bodies;
		const omega = 2 * Math.PI * GRAB_HZ;

		// snapshot previous state (render interpolation) + pre-force velocities
		// (restitution reference + net-force readout)
		for (const b of bodies) {
			b.ppx = b.px;
			b.ppy = b.py;
			b.pangle = b.angle;
			b.pgvx = b.vx;
			b.pgvy = b.vy;
			b.pgw = b.w;
		}

		// integrate forces — semi-implicit Euler applies velocity first
		if (this.grab) wake(this.grab.body);
		for (const b of bodies) {
			if (b.isStatic || b.asleep) continue;
			b.vy += p.gravity * DT;
			b.w *= 1 / (1 + ANGULAR_DAMPING * DT);
		}
		if (this.grab) {
			const g = this.grab;
			const b = g.body;
			const c = Math.cos(b.angle);
			const s = Math.sin(b.angle);
			const rx = c * g.lx - s * g.ly;
			const ry = s * g.lx + c * g.ly;
			const axv = b.vx - b.w * ry; // anchor-point velocity
			const ayv = b.vy + b.w * rx;
			const k = b.mass * omega * omega;
			const cD = 2 * b.mass * GRAB_ZETA * omega;
			let fx = k * (g.tx - (b.px + rx)) - cD * axv;
			let fy = k * (g.ty - (b.py + ry)) - cD * ayv;
			const fMax = GRAB_MAX_FORCE * b.mass;
			const fLen = Math.hypot(fx, fy);
			if (fLen > fMax) {
				fx = (fx / fLen) * fMax;
				fy = (fy / fLen) * fMax;
			}
			b.vx += fx * b.invMass * DT;
			b.vy += fy * b.invMass * DT;
			b.w += b.invI * (rx * fy - ry * fx) * DT;
		}

		// broadphase (O(n²) AABB) + narrow phase + wake-on-touch
		const manifolds: Manifold[] = [];
		for (let i = 0; i < bodies.length; i++) {
			const a = bodies[i];
			bodyAABB(a, this.aabbA);
			for (let j = i + 1; j < bodies.length; j++) {
				const b = bodies[j];
				if (a.invMass === 0 && b.invMass === 0) continue;
				const aIdle = a.isStatic || a.asleep;
				const bIdle = b.isStatic || b.asleep;
				if (aIdle && bIdle) continue;
				bodyAABB(b, this.aabbB);
				if (
					this.aabbA.minX > this.aabbB.maxX + 0.01 ||
					this.aabbB.minX > this.aabbA.maxX + 0.01 ||
					this.aabbA.minY > this.aabbB.maxY + 0.01 ||
					this.aabbB.minY > this.aabbA.maxY + 0.01
				)
					continue;
				const m = collide(a, b);
				if (!m) continue;
				// a slow graze shouldn't wake a settled pile — a real mover should
				const speedA = a.vx * a.vx + a.vy * a.vy;
				const speedB = b.vx * b.vx + b.vy * b.vy;
				const wake2 = WAKE_SPEED * WAKE_SPEED;
				if (a.asleep && !bIdle && speedB > wake2) wake(a);
				if (b.asleep && !aIdle && speedA > wake2) wake(b);
				manifolds.push(m);
			}
		}

		// prestep pass 1 — effective masses + Baumgarte/restitution bias for ALL
		// contacts BEFORE any warm-start impulse touches a velocity. Fusing the
		// two passes makes later contacts read restitution off phantom approach
		// speeds injected by earlier warm starts, and tall stacks explode.
		const nextImpulses = new Map<number, { jn: number; jt: number }>();
		for (const m of manifolds) {
			const { a, b, nx, ny } = m;
			const imA = a.asleep ? 0 : a.invMass;
			const iiA = a.asleep ? 0 : a.invI;
			const imB = b.asleep ? 0 : b.invMass;
			const iiB = b.asleep ? 0 : b.invI;
			for (const ct of m.contacts) {
				ct.rax = ct.px - a.px;
				ct.ray = ct.py - a.py;
				ct.rbx = ct.px - b.px;
				ct.rby = ct.py - b.py;
				const rnA = ct.rax * ny - ct.ray * nx;
				const rnB = ct.rbx * ny - ct.rby * nx;
				ct.massN = 1 / (imA + imB + iiA * rnA * rnA + iiB * rnB * rnB);
				const tx = -ny;
				const ty = nx;
				const rtA = ct.rax * ty - ct.ray * tx;
				const rtB = ct.rbx * ty - ct.rby * tx;
				ct.massT = 1 / (imA + imB + iiA * rtA * rtA + iiB * rtB * rtB);

				ct.bias = (BETA / DT) * Math.max(ct.pen - SLOP, 0);
				const dvx = b.pgvx - b.pgw * ct.rby - a.pgvx + a.pgw * ct.ray;
				const dvy = b.pgvy + b.pgw * ct.rbx - a.pgvy - a.pgw * ct.rax;
				const vn = dvx * nx + dvy * ny;
				if (vn < -RESTITUTION_THRESHOLD) ct.bias = Math.max(ct.bias, -p.restitution * vn);

				const old = this.impulses.get(a.id * 1_000_000 + b.id * 1000 + ct.fid);
				if (old) {
					ct.jn = old.jn;
					ct.jt = old.jt;
				}
			}
		}
		// prestep pass 2 — apply last step's accumulated impulses (warm start)
		for (const m of manifolds) {
			const { a, b, nx, ny } = m;
			const imA = a.asleep ? 0 : a.invMass;
			const iiA = a.asleep ? 0 : a.invI;
			const imB = b.asleep ? 0 : b.invMass;
			const iiB = b.asleep ? 0 : b.invI;
			const tx = -ny;
			const ty = nx;
			for (const ct of m.contacts) {
				if (ct.jn === 0 && ct.jt === 0) continue;
				const px = ct.jn * nx + ct.jt * tx;
				const py = ct.jn * ny + ct.jt * ty;
				a.vx -= px * imA;
				a.vy -= py * imA;
				a.w -= iiA * (ct.rax * py - ct.ray * px);
				b.vx += px * imB;
				b.vy += py * imB;
				b.w += iiB * (ct.rbx * py - ct.rby * px);
			}
		}

		// prestep joints
		for (const j of this.joints) {
			const b = j.body;
			const c = Math.cos(b.angle);
			const s = Math.sin(b.angle);
			j.rx = c * j.lx - s * j.ly;
			j.ry = s * j.lx + c * j.ly;
			const ux = b.px + j.rx - j.ax;
			const uy = b.py + j.ry - j.ay;
			const len = Math.hypot(ux, uy) || 1e-9;
			j.nx = ux / len;
			j.ny = uy / len;
			const rn = j.rx * j.ny - j.ry * j.nx;
			const im = b.asleep ? 0 : b.invMass;
			const ii = b.asleep ? 0 : b.invI;
			const k = im + ii * rn * rn;
			j.effMass = k > 0 ? 1 / k : 0;
			j.bias = (BETA / DT) * (len - j.len);
		}

		// sequential impulses
		for (let iter = 0; iter < VELOCITY_ITERATIONS; iter++) {
			for (const j of this.joints) {
				const b = j.body;
				if (b.asleep) continue;
				const relV = (b.vx - b.w * j.ry) * j.nx + (b.vy + b.w * j.rx) * j.ny;
				const lambda = -j.effMass * (relV + j.bias);
				b.vx += lambda * j.nx * b.invMass;
				b.vy += lambda * j.ny * b.invMass;
				b.w += b.invI * (j.rx * j.ny * lambda - j.ry * j.nx * lambda);
			}
			for (const m of manifolds) {
				const { a, b, nx, ny } = m;
				const imA = a.asleep ? 0 : a.invMass;
				const iiA = a.asleep ? 0 : a.invI;
				const imB = b.asleep ? 0 : b.invMass;
				const iiB = b.asleep ? 0 : b.invI;
				const tx = -ny;
				const ty = nx;
				for (const ct of m.contacts) {
					// normal impulse (accumulated, clamped ≥ 0)
					let dvx = b.vx - b.w * ct.rby - a.vx + a.w * ct.ray;
					let dvy = b.vy + b.w * ct.rbx - a.vy - a.w * ct.rax;
					const vn = dvx * nx + dvy * ny;
					let dJn = ct.massN * (ct.bias - vn);
					const jn0 = ct.jn;
					ct.jn = Math.max(jn0 + dJn, 0);
					dJn = ct.jn - jn0;
					let px = dJn * nx;
					let py = dJn * ny;
					a.vx -= px * imA;
					a.vy -= py * imA;
					a.w -= iiA * (ct.rax * py - ct.ray * px);
					b.vx += px * imB;
					b.vy += py * imB;
					b.w += iiB * (ct.rbx * py - ct.rby * px);

					// friction impulse (Coulomb clamp: |jt| ≤ μ·jn)
					dvx = b.vx - b.w * ct.rby - a.vx + a.w * ct.ray;
					dvy = b.vy + b.w * ct.rbx - a.vy - a.w * ct.rax;
					const vt = dvx * tx + dvy * ty;
					let dJt = ct.massT * -vt;
					const maxJt = p.friction * ct.jn;
					const jt0 = ct.jt;
					ct.jt = Math.max(-maxJt, Math.min(maxJt, jt0 + dJt));
					dJt = ct.jt - jt0;
					px = dJt * tx;
					py = dJt * ty;
					a.vx -= px * imA;
					a.vy -= py * imA;
					a.w -= iiA * (ct.rax * py - ct.ray * px);
					b.vx += px * imB;
					b.vy += py * imB;
					b.w += iiB * (ct.rbx * py - ct.rby * px);
				}
			}
		}

		// store accumulated impulses for next step's warm start
		for (const m of manifolds) {
			for (const ct of m.contacts) {
				nextImpulses.set(m.a.id * 1_000_000 + m.b.id * 1000 + ct.fid, { jn: ct.jn, jt: ct.jt });
			}
		}
		this.impulses = nextImpulses;

		// integrate positions + speed clamp + sleep bookkeeping + force readout
		this.ke = 0;
		this.pe = 0;
		for (let i = 0; i < bodies.length; i++) {
			const b = bodies[i];
			if (b.isStatic) continue;
			if (!b.asleep) {
				const sp = Math.hypot(b.vx, b.vy);
				if (sp > MAX_SPEED) {
					b.vx = (b.vx / sp) * MAX_SPEED;
					b.vy = (b.vy / sp) * MAX_SPEED;
				}
				b.px += b.vx * DT;
				b.py += b.vy * DT;
				b.angle += b.w * DT;

				const grabbed = this.grab?.body === b;
				if (!grabbed && b.vx * b.vx + b.vy * b.vy < SLEEP_LIN * SLEEP_LIN && Math.abs(b.w) < SLEEP_ANG) {
					b.sleepTime += DT;
					if (b.sleepTime > SLEEP_TIME) {
						b.asleep = true;
						b.vx = 0;
						b.vy = 0;
						b.w = 0;
					}
				} else {
					b.sleepTime = 0;
				}

				const fx = (b.vx - b.pgvx) * b.mass * (1 / DT);
				const fy = (b.vy - b.pgvy) * b.mass * (1 / DT);
				b.fEmaX += 0.3 * (fx - b.fEmaX);
				b.fEmaY += 0.3 * (fy - b.fEmaY);
			} else {
				b.fEmaX = 0;
				b.fEmaY = 0;
			}

			// energy readout comes straight from solver state — never faked
			if (!b.asleep) this.ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.inertia * b.w * b.w;
			this.pe += b.mass * p.gravity * (this.floorY - b.py);

			// trails — sample while moving, and let every point age out so a
			// settled scene doesn't keep fossil arcs around forever
			if (!p.trailsOn) {
				if (b.trail.length > 0) b.trail.length = 0;
			} else {
				if (this.steps % TRAIL_EVERY === 0 && !b.asleep && b.vx * b.vx + b.vy * b.vy > 0.01) {
					b.trail.push(b.px, b.py, this.steps);
					if (b.trail.length > TRAIL_MAX * 3) b.trail.splice(0, 3);
				}
				while (b.trail.length > 0 && this.steps - b.trail[2] > TRAIL_TTL) b.trail.splice(0, 3);
			}
		}

		// projectile scene logic: a sleeping ball reloads the launcher.
		// The flight itself is untouched physics — only the reset is scripted.
		if (this.scene === "projectile" && !p.noRespawn) {
			const ball = bodies.find((b) => b.tag === "ball");
			if (ball?.asleep) {
				ball.px = ball.ppx = this.launch.x;
				ball.py = ball.ppy = this.launch.y;
				ball.angle = ball.pangle = 0;
				ball.vx = this.launch.vx;
				ball.vy = this.launch.vy;
				ball.w = 0;
				ball.trail.length = 0;
				wake(ball);
			}
		}

		this.steps++;
	}
}

/* ================================================================
 * 7 · Scene builders — deterministic, sealed by 1 m static bounds
 * ============================================================== */

function addBounds(world: World) {
	const W = world.worldW;
	const H = world.worldH;
	const span = H - CEIL_Y + 2 * WALL;
	const midY = (CEIL_Y + H) / 2;
	world.add(makeStatic(W / 2, world.floorY + WALL / 2, W + 4 * WALL, WALL)); // floor
	world.add(makeStatic(-WALL / 2, midY, WALL, span)); // left
	world.add(makeStatic(W + WALL / 2, midY, WALL, span)); // right
	world.add(makeStatic(W / 2, CEIL_Y - WALL / 2, W + 4 * WALL, WALL)); // ceiling
}

export function buildScene(world: World, count: number, sizeVariation: number, rng: () => number) {
	const W = world.worldW;
	const H = world.worldH;
	const floorY = world.floorY;
	addBounds(world);

	switch (world.scene) {
		case "playground": {
			// mixed shapes rain from above the viewport and settle. sizeVariation
			// spreads a per-body scale factor, biased upward so max variation
			// breeds boulders rather than dust — density is fixed, so bigger is
			// genuinely heavier, and the size slider doubles as a mass slider.
			const spread = Math.max(0, Math.min(sizeVariation, 1));
			for (let i = 0; i < count; i++) {
				const x = 0.7 + rng() * Math.max(W - 1.4, 0.5);
				const y = -0.4 - rng() * (3.4 + 3 * spread); // deeper band, boulders need headroom
				const f = 1 + spread * (rng() * 3.1 - 0.45);
				if (rng() < 0.6) {
					// world-relative caps keep a max-roll boulder from dwarfing small stages
					world.add(makeCircle(x, y, Math.min(0.34 * f, H * 0.16, W * 0.12), 1));
				} else {
					const bw = Math.min(0.58 * f, H * 0.26, W * 0.2);
					world.add(makeBox(x, y, bw, bw * (0.75 + rng() * 0.4), (rng() - 0.5) * Math.PI, 1));
				}
			}
			break;
		}
		case "stack": {
			// a tower that stands rock-still (warm starting at work) + ammo ball
			const bh = 0.36;
			const n = Math.max(4, Math.min(count, 12, Math.floor((H - 2) / bh)));
			const baseX = W * 0.62;
			for (let i = 0; i < n; i++) {
				world.add(makeBox(baseX + (rng() - 0.5) * 0.002, floorY - bh / 2 - i * (bh + 0.001), 0.62, bh, 0, 1));
			}
			const ammo = world.add(makeCircle(Math.min(W * 0.18, baseX - 2), floorY - 0.31, 0.3, 3));
			ammo.tag = "ammo";
			break;
		}
		case "wrecking-ball": {
			// heavy ball on a rigid rod, released 40° off vertical — pure gravity does the rest
			const ax = W * 0.5;
			const ay = 0.6;
			const len = Math.min(H - 1.85, (W / 2 - 0.6) / 0.64);
			const theta = (40 * Math.PI) / 180;
			const ball = world.add(makeCircle(ax - len * Math.sin(theta), ay + len * Math.cos(theta), 0.45, 6));
			ball.tag = "wrecker";
			world.joints.push({
				body: ball,
				ax,
				ay,
				lx: 0,
				ly: 0,
				len,
				rx: 0,
				ry: 0,
				nx: 0,
				ny: 0,
				effMass: 0,
				bias: 0,
			});
			const bh = 0.38;
			const levels = Math.max(3, Math.min(Math.round(count / 2), 12, Math.floor((H - 2) / (bh + 0.001))));
			const towerX = ax + len * 0.42;
			for (let i = 0; i < levels; i++) {
				world.add(makeBox(towerX + (rng() - 0.5) * 0.004, floorY - bh / 2 - i * (bh + 0.001), 0.5, bh, 0, 1));
			}
			break;
		}
		case "projectile": {
			// launched ball, real parabola, targets downrange; sleeping ball reloads
			const x0 = 0.8;
			const y0 = floorY - 0.6;
			const vy = -0.85 * Math.sqrt(19.6 * Math.max(H - 2, 1));
			const flight = (2 * -vy) / 9.8;
			const vx = Math.max((W - 3 - x0) / flight, 1.5);
			world.launch = { x: x0, y: y0, vx, vy };
			const ball = world.add(makeCircle(x0, y0, 0.25, 2));
			ball.tag = "ball";
			ball.vx = vx;
			ball.vy = vy;
			const bh = 0.38;
			world.add(makeBox(W - 2.5, floorY - bh / 2, 0.5, bh, 0, 1));
			world.add(makeBox(W - 1.9, floorY - bh / 2, 0.5, bh, 0, 1));
			world.add(makeBox(W - 2.2, floorY - bh - bh / 2 - 0.002, 0.5, bh, 0, 1));
			break;
		}
	}
}

/* ================================================================
 * 8 · Component
 * ============================================================== */

export interface PhysicsEngineProps {
	scene?: PhysicsScene;
	gravity?: number; // m/s², downward
	restitution?: number; // 0–1
	friction?: number; // Coulomb coefficient
	timeScale?: number; // 0 freezes time; physics always steps at 120 Hz
	bodyCount?: number;
	sizeVariation?: number; // 0 = uniform playground bodies, 1 = pebbles to boulders
	showVectors?: boolean;
	trails?: boolean;
	showEnergy?: boolean;
	tint?: string; // hex accent for dynamic bodies
	background?: string;
	gridMinor?: string;
	gridMajor?: string;
	ink?: string; // HUD / ruler text
	staticColor?: string; // floor, anchors, rods
	/** Force the quiet path on top of the OS-level preference. */
	reducedMotion?: boolean;
	className?: string;
}

function hexToRgba(hex: string, alpha: number): string {
	let h = hex.replace("#", "");
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	const n = parseInt(h, 16);
	if (Number.isNaN(n) || h.length !== 6) return `rgba(168,85,247,${alpha})`;
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const PhysicsEngine = memo(function PhysicsEngine({
	scene = "playground",
	gravity = 9.8,
	restitution = 0.6,
	friction = 0.4,
	timeScale = 1,
	bodyCount = 14,
	sizeVariation = 0.5,
	showVectors = false,
	trails = true,
	showEnergy = true,
	tint = "#a855f7",
	background = "#0b0f16",
	gridMinor = "rgba(148,163,184,0.07)",
	gridMajor = "rgba(148,163,184,0.16)",
	ink = "rgba(226,232,240,0.85)",
	staticColor = "rgba(148,163,184,0.45)",
	reducedMotion = false,
	className = "",
}: PhysicsEngineProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wakeRef = useRef<(() => void) | null>(null);
	const restageRef = useRef<(() => void) | null>(null);

	const [osReduced, setOsReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setOsReduced(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);
	const reduce = reducedMotion || osReduced;

	// live-tunable values, read by the loop through a ref — no remount, no reset
	const propsRef = useRef({
		gravity,
		restitution,
		friction,
		timeScale,
		showVectors,
		trails,
		showEnergy,
		tint,
		background,
		gridMinor,
		gridMajor,
		ink,
		staticColor,
	});
	propsRef.current = {
		gravity,
		restitution,
		friction,
		timeScale,
		showVectors,
		trails,
		showEnergy,
		tint,
		background,
		gridMinor,
		gridMajor,
		ink,
		staticColor,
	};

	// changing the physical laws mid-sim must disturb settled bodies
	useEffect(() => {
		wakeRef.current?.();
	}, [gravity, restitution, friction]);

	// under reduced motion there is no loop — re-settle and repaint on any tune
	useEffect(() => {
		restageRef.current?.();
	}, [gravity, restitution, friction, showVectors, trails, showEnergy, tint, background, gridMinor, gridMajor, ink, staticColor]);

	useEffect(() => {
		const root = rootRef.current;
		const canvas = canvasRef.current;
		if (!root || !canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		let world: World | null = null;
		let cssW = 0;
		let cssH = 0;
		let raf = 0;
		let ioVisible = true;
		let pageVisible = !document.hidden;
		let lastT = 0;
		let acc = 0;
		let grabbing: { pointerId: number } | null = null;
		let disposed = false;

		// cached blueprint grid — repainted only on resize / palette change
		const gridCanvas = document.createElement("canvas");
		let gridKey = "";

		const stepParams = (): StepParams => ({
			gravity: propsRef.current.gravity,
			restitution: propsRef.current.restitution,
			friction: propsRef.current.friction,
			trailsOn: propsRef.current.trails,
			noRespawn: reduce,
		});

		function buildWorld() {
			world = new World(cssW / SCALE, cssH / SCALE, scene);
			buildScene(world, bodyCount, sizeVariation, mulberry32(SEED));
			grabbing = null;
			world.grab = null;
		}

		function settle() {
			if (!world) return;
			const p = stepParams();
			for (let i = 0; i < 600; i++) {
				world.step(p);
				if (i > 60 && world.bodies.every((b) => b.isStatic || b.asleep)) break;
			}
		}

		function paintGrid() {
			const { gridMinor: minor, gridMajor: major, ink: inkC } = propsRef.current;
			const key = `${cssW}|${cssH}|${minor}|${major}|${inkC}`;
			if (key === gridKey) return;
			gridKey = key;
			gridCanvas.width = Math.max(cssW * dpr, 1);
			gridCanvas.height = Math.max(cssH * dpr, 1);
			const g = gridCanvas.getContext("2d");
			if (!g) return;
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, cssW, cssH);
			const minorPx = SCALE / 4;
			g.lineWidth = 1;
			g.strokeStyle = minor;
			g.beginPath();
			for (let x = 0; x <= cssW; x += minorPx) {
				g.moveTo(x, 0);
				g.lineTo(x, cssH);
			}
			for (let y = 0; y <= cssH; y += minorPx) {
				g.moveTo(0, y);
				g.lineTo(cssW, y);
			}
			g.stroke();
			g.strokeStyle = major;
			g.beginPath();
			for (let x = 0; x <= cssW; x += SCALE) {
				g.moveTo(x, 0);
				g.lineTo(x, cssH);
			}
			for (let y = 0; y <= cssH; y += SCALE) {
				g.moveTo(0, y);
				g.lineTo(cssW, y);
			}
			g.stroke();
			// meter ruler along the floor line
			const floorPx = (cssH / SCALE - 0.35) * SCALE;
			g.fillStyle = inkC;
			g.globalAlpha = 0.55;
			g.font = '9px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
			g.textAlign = "center";
			for (let m = 1; m * SCALE < cssW - 12; m++) {
				g.fillText(`${m}`, m * SCALE, floorPx - 5);
			}
			g.textAlign = "left";
			g.fillText("m", 4, floorPx - 5);
			g.globalAlpha = 1;
		}

		function drawArrow(x: number, y: number, dx: number, dy: number, color: string, dashed: boolean) {
			const len = Math.hypot(dx, dy);
			if (len < 7) return;
			const s = len > ARROW_MAX ? ARROW_MAX / len : 1;
			const ex = x + dx * s;
			const ey = y + dy * s;
			ctx!.strokeStyle = color;
			ctx!.lineWidth = 1.5;
			ctx!.setLineDash(dashed ? [4, 3] : []);
			ctx!.beginPath();
			ctx!.moveTo(x, y);
			ctx!.lineTo(ex, ey);
			ctx!.stroke();
			ctx!.setLineDash([]);
			const ang = Math.atan2(ey - y, ex - x);
			ctx!.beginPath();
			ctx!.moveTo(ex, ey);
			ctx!.lineTo(ex - 6 * Math.cos(ang - 0.45), ey - 6 * Math.sin(ang - 0.45));
			ctx!.moveTo(ex, ey);
			ctx!.lineTo(ex - 6 * Math.cos(ang + 0.45), ey - 6 * Math.sin(ang + 0.45));
			ctx!.stroke();
		}

		function draw(alpha: number) {
			if (!world) return;
			const pr = propsRef.current;
			paintGrid();
			ctx!.fillStyle = pr.background;
			ctx!.fillRect(0, 0, cssW, cssH);
			ctx!.drawImage(gridCanvas, 0, 0, cssW, cssH);

			// trails — tint parsed once; alpha = recency gradient × age fade
			if (pr.trails) {
				ctx!.lineWidth = 1;
				const rgb = hexToRgba(pr.tint, 1).slice(5, -3); // "r,g,b"
				for (const b of world.bodies) {
					const t = b.trail;
					const pts = t.length / 3;
					if (pts < 2) continue;
					for (let i = 1; i < pts; i++) {
						const age = Math.max(0, 1 - (world.steps - t[i * 3 + 2]) / TRAIL_TTL);
						ctx!.strokeStyle = `rgba(${rgb},${((0.05 + 0.4 * (i / pts)) * age).toFixed(3)})`;
						ctx!.beginPath();
						ctx!.moveTo(t[(i - 1) * 3] * SCALE, t[(i - 1) * 3 + 1] * SCALE);
						ctx!.lineTo(t[i * 3] * SCALE, t[i * 3 + 1] * SCALE);
						ctx!.stroke();
					}
				}
			}

			// rods + anchors, behind bodies
			ctx!.strokeStyle = pr.staticColor;
			ctx!.fillStyle = pr.staticColor;
			ctx!.lineWidth = 1.5;
			for (const j of world.joints) {
				const b = j.body;
				const ix = (b.ppx + (b.px - b.ppx) * alpha) * SCALE;
				const iy = (b.ppy + (b.py - b.ppy) * alpha) * SCALE;
				ctx!.beginPath();
				ctx!.moveTo(j.ax * SCALE, j.ay * SCALE);
				ctx!.lineTo(ix, iy);
				ctx!.stroke();
				ctx!.beginPath();
				ctx!.arc(j.ax * SCALE, j.ay * SCALE, 3.5, 0, Math.PI * 2);
				ctx!.fill();
			}

			// bodies
			for (const b of world.bodies) {
				const ix = (b.ppx + (b.px - b.ppx) * alpha) * SCALE;
				const iy = (b.ppy + (b.py - b.ppy) * alpha) * SCALE;
				const ia = b.pangle + (b.angle - b.pangle) * alpha;
				if (b.isStatic) {
					ctx!.save();
					ctx!.translate(ix, iy);
					ctx!.fillStyle = pr.staticColor;
					ctx!.globalAlpha = 0.5;
					ctx!.fillRect(-b.hw * SCALE, -b.hh * SCALE, b.hw * 2 * SCALE, b.hh * 2 * SCALE);
					ctx!.restore();
					continue;
				}
				ctx!.save();
				ctx!.translate(ix, iy);
				ctx!.rotate(ia);
				if (b.asleep) ctx!.globalAlpha = 0.55;
				ctx!.fillStyle = hexToRgba(pr.tint, Math.min(0.12 + 0.06 * b.density, 0.45));
				ctx!.strokeStyle = pr.tint;
				ctx!.lineWidth = 1.5;
				if (b.kind === "circle") {
					ctx!.beginPath();
					ctx!.arc(0, 0, b.r * SCALE, 0, Math.PI * 2);
					ctx!.fill();
					ctx!.stroke();
					// radius spoke makes rotation visible
					ctx!.beginPath();
					ctx!.moveTo(0, 0);
					ctx!.lineTo(b.r * SCALE, 0);
					ctx!.stroke();
				} else {
					ctx!.beginPath();
					ctx!.rect(-b.hw * SCALE, -b.hh * SCALE, b.hw * 2 * SCALE, b.hh * 2 * SCALE);
					ctx!.fill();
					ctx!.stroke();
				}
				ctx!.restore();
			}

			// grab spring
			if (world.grab) {
				const g = world.grab;
				const b = g.body;
				const c = Math.cos(b.angle);
				const s = Math.sin(b.angle);
				const axp = (b.px + c * g.lx - s * g.ly) * SCALE;
				const ayp = (b.py + s * g.lx + c * g.ly) * SCALE;
				ctx!.strokeStyle = pr.tint;
				ctx!.lineWidth = 1;
				ctx!.setLineDash([5, 4]);
				ctx!.beginPath();
				ctx!.moveTo(g.tx * SCALE, g.ty * SCALE);
				ctx!.lineTo(axp, ayp);
				ctx!.stroke();
				ctx!.setLineDash([]);
			}

			// velocity + net-force overlays
			if (pr.showVectors) {
				for (const b of world.bodies) {
					if (b.isStatic || b.asleep) continue;
					const ix = b.px * SCALE;
					const iy = b.py * SCALE;
					drawArrow(ix, iy, b.vx * 5, b.vy * 5, VEL_COLOR, false);
					drawArrow(ix, iy, b.fEmaX * 4, b.fEmaY * 4, FORCE_COLOR, true);
				}
			}

			// HUD — numbers straight from the solver
			if (pr.showEnergy) {
				const total = world.ke + world.pe;
				let asleepCount = 0;
				let dyn = 0;
				for (const b of world.bodies) {
					if (b.isStatic) continue;
					dyn++;
					if (b.asleep) asleepCount++;
				}
				// top inset matches the 10px left inset — symmetric top-left corner
				ctx!.fillStyle = pr.ink;
				ctx!.font = '11px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
				ctx!.textAlign = "left";
				ctx!.textBaseline = "top";
				ctx!.fillText(
					`KE ${world.ke.toFixed(1)} J   PE ${world.pe.toFixed(1)} J   ΣE ${total.toFixed(1)} J`,
					10,
					10,
				);
				ctx!.globalAlpha = 0.6;
				ctx!.fillText(`${dyn} bodies · ${asleepCount} asleep · 120 Hz fixed step`, 10, 25);
				ctx!.globalAlpha = 1;
				ctx!.textBaseline = "alphabetic";
			}

			// interaction hint — top center
			ctx!.fillStyle = pr.ink;
			ctx!.globalAlpha = 0.45;
			ctx!.font = '10px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
			ctx!.textAlign = "center";
			ctx!.fillText(reduce ? "static preview · reduced motion" : "drag a body to throw it", cssW / 2, 20);
			ctx!.globalAlpha = 1;
			ctx!.textAlign = "left";
		}

		/* ---- fixed-timestep loop: physics at 120 Hz, render interpolated ---- */

		function loop(t: number) {
			raf = requestAnimationFrame(loop);
			if (!world) return;
			const delta = Math.min((t - lastT) / 1000, MAX_FRAME_DELTA);
			lastT = t;
			acc += Math.max(delta, 0) * propsRef.current.timeScale;
			let steps = 0;
			const p = stepParams();
			while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
				world.step(p);
				acc -= DT;
				steps++;
			}
			if (steps === MAX_STEPS_PER_FRAME) acc = acc % DT; // drop backlog, never spiral
			draw(propsRef.current.timeScale > 0 ? Math.min(acc / DT, 1) : 1);
		}

		const tryStart = () => {
			if (reduce || raf !== 0 || !ioVisible || !pageVisible || disposed) return;
			lastT = performance.now();
			acc = 0;
			raf = requestAnimationFrame(loop);
		};
		const tryStop = () => {
			if (raf !== 0) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		};

		/* ---- sizing (debounced after first layout; rebuild keeps the seed) ---- */

		let sized = false;
		let resizeTimer: ReturnType<typeof setTimeout> | undefined;
		function applySize() {
			const rect = root!.getBoundingClientRect();
			const w = Math.max(rect.width, 0);
			const h = Math.max(rect.height, 0);
			if (w < 40 || h < 40) return;
			if (Math.abs(w - cssW) < 1 && Math.abs(h - cssH) < 1) return;
			cssW = w;
			cssH = h;
			canvas!.width = w * dpr;
			canvas!.height = h * dpr;
			canvas!.style.width = `${w}px`;
			canvas!.style.height = `${h}px`;
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			buildWorld();
			if (reduce) settle();
			draw(1);
		}
		const ro = new ResizeObserver(() => {
			if (!sized) {
				sized = true;
				applySize();
				return;
			}
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(applySize, 150);
		});
		ro.observe(root);

		/* ---- visibility gates: hidden Code tab / background browser tab ---- */

		const io = new IntersectionObserver(
			([entry]) => {
				ioVisible = entry.isIntersecting;
				if (ioVisible) tryStart();
				else tryStop();
			},
			{ threshold: 0 },
		);
		io.observe(root);
		const onVisibility = () => {
			pageVisible = !document.hidden;
			if (pageVisible) tryStart();
			else tryStop();
		};
		document.addEventListener("visibilitychange", onVisibility);

		/* ---- pointer interaction: grab, drag, throw ---- */

		function toWorld(e: PointerEvent): { x: number; y: number } {
			const rect = canvas!.getBoundingClientRect();
			return { x: (e.clientX - rect.left) / SCALE, y: (e.clientY - rect.top) / SCALE };
		}

		function hitTest(x: number, y: number): Body | null {
			if (!world) return null;
			for (let i = world.bodies.length - 1; i >= 0; i--) {
				const b = world.bodies[i];
				if (b.isStatic) continue;
				if (b.kind === "circle") {
					const dx = x - b.px;
					const dy = y - b.py;
					if (dx * dx + dy * dy <= b.r * b.r) return b;
				} else {
					const c = Math.cos(b.angle);
					const s = Math.sin(b.angle);
					const dx = x - b.px;
					const dy = y - b.py;
					const lx = c * dx + s * dy;
					const ly = -s * dx + c * dy;
					if (Math.abs(lx) <= b.hw && Math.abs(ly) <= b.hh) return b;
				}
			}
			return null;
		}

		function releaseGrab() {
			if (world) world.grab = null;
			grabbing = null;
			canvas!.style.cursor = "";
		}

		const onPointerDown = (e: PointerEvent) => {
			if (!world || e.button > 0) return;
			const pos = toWorld(e);
			const body = hitTest(pos.x, pos.y);
			if (!body) return;
			wake(body);
			const c = Math.cos(body.angle);
			const s = Math.sin(body.angle);
			const dx = pos.x - body.px;
			const dy = pos.y - body.py;
			world.grab = {
				body,
				lx: c * dx + s * dy,
				ly: -s * dx + c * dy,
				tx: pos.x,
				ty: pos.y,
			};
			grabbing = { pointerId: e.pointerId };
			canvas!.setPointerCapture(e.pointerId);
			canvas!.style.cursor = "grabbing";
			if (reduce) draw(1); // show the spring even without a loop
		};
		const onPointerMove = (e: PointerEvent) => {
			if (!world) return;
			if (grabbing && e.pointerId === grabbing.pointerId && world.grab) {
				const pos = toWorld(e);
				world.grab.tx = pos.x;
				world.grab.ty = pos.y;
			} else if (!grabbing && e.pointerType === "mouse") {
				const pos = toWorld(e);
				canvas!.style.cursor = hitTest(pos.x, pos.y) ? "grab" : "";
			}
		};
		const onPointerEnd = (e: PointerEvent) => {
			if (grabbing && e.pointerId === grabbing.pointerId) releaseGrab();
		};
		// non-passive: block page scroll only while a body is actually held
		const onTouchMove = (e: TouchEvent) => {
			if (grabbing) e.preventDefault();
		};

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerEnd);
		canvas.addEventListener("pointercancel", onPointerEnd);
		canvas.addEventListener("lostpointercapture", onPointerEnd);
		canvas.addEventListener("touchmove", onTouchMove, { passive: false });

		/* ---- external hooks for live-tuned props ---- */

		wakeRef.current = () => world?.wakeAll();
		restageRef.current = () => {
			if (!reduce || !world) return;
			buildWorld();
			settle();
			draw(1);
		};

		tryStart();

		return () => {
			disposed = true;
			tryStop();
			clearTimeout(resizeTimer);
			ro.disconnect();
			io.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerEnd);
			canvas.removeEventListener("pointercancel", onPointerEnd);
			canvas.removeEventListener("lostpointercapture", onPointerEnd);
			canvas.removeEventListener("touchmove", onTouchMove);
			wakeRef.current = null;
			restageRef.current = null;
			world = null;
		};
		// scene/bodyCount/sizeVariation/reduce rebuild the world; everything else
		// flows through propsRef
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scene, bodyCount, sizeVariation, reduce]);

	return (
		<div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`}>
			<canvas
				ref={canvasRef}
				role="img"
				aria-label="Interactive 2D physics sandbox — drag bodies to throw them"
				className="absolute inset-0"
			/>
		</div>
	);
});

export default PhysicsEngine;
