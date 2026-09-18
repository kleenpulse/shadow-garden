"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useAnimationFrame } from "motion/react";
import type Lenis from "lenis";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import type { LandingData } from "@/components/landing/data";
import type { CubeDrive, RubiksCubeHandle } from "@/components/landing/rubiks-cube";
import {
	ROUTE_DAMP,
	ROUTE_END,
	sampleRoute,
	SCRUB_SEED,
	TRAVELER_ROUTE,
	V_REF,
	type Pose,
	type RouteFrame,
	type RouteNode,
} from "@/components/landing/traveler-route";

const RubiksCube = dynamic(
	() => import("@/components/landing/rubiks-cube"),
	{ ssr: false },
);

interface CubeTravelerProps {
	hero: LandingData["hero"];
	cubeRef: RefObject<RubiksCubeHandle | null>;
	/** Resolved by the gate, not here. lenis/react's root store is written in
	 *  the commit after SmoothScroll mounts, and its useStore only re-reads on a
	 *  later write — a component that mounts in that same second commit
	 *  subscribes after the write and never sees lenis at all. The gate mounts
	 *  in the first commit, so it does. */
	lenis: Lenis | undefined;
}

/** Below this the cube is invisible; hold it there this long before parking. */
const PARK_OPACITY = 0.02;
const PARK_AFTER_MS = 400;
/** Easing rate for the smoothed velocity (1/s). */
const SMOOTH_RATE = 10;
/** Brightness of the cube's periodic specular sweep. */
const SHEEN_STRENGTH = 0.9;

const restPose = (): Pose => ({
	x: 0,
	y: 0,
	scale: 1,
	opacity: 1,
	azimuth: 0,
	elevation: 0,
});

// The scroll hero's cube: one fixed, full-viewport layer behind the whole
// landing page, carrying the same cube box the classic hero mounts, so scroll 0
// is the classic opening (bar the grid wash below) and everything after is
// the route in traveler-route.ts.
//
// Negative z, not z-0. Root paint order is root background → negative-z
// contexts → in-flow blocks → positioned z-auto in DOM order; the exhibit and
// calibration sections are plain in-flow blocks, so a z-0 layer would paint the
// cube over their headings. At -z-10 it sits above only the body's grid (which
// propagates to the canvas because <html> carries no background of its own).
// Two things would silently break this: a transform, filter, contain:paint or
// will-change on <main> or <body> (a containing block for fixed, the layer
// would scroll away), and a background on <html> (body's would stop
// propagating and paint over the layer).
//
// A negative-z layer can never be hit-tested, so the hero's drag relays
// through the cube handle instead (LandingHero's drag pad).
export default function CubeTraveler({ hero, cubeRef, lenis }: CubeTravelerProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const scrub = useMemo(() => ({ seed: SCRUB_SEED }), []);
	const moveTotal = Math.max(1, Math.round(hero.cube.scrambleMoveCount)) * 2;

	// Everything the frame loop touches lives in refs. React renders exactly
	// twice over a whole visit: mount, and the park/unpark flip through sealed.
	const scrollRef = useRef({ scroll: 0, limit: 1, velocity: 0 });
	const frameRef = useRef<RouteFrame>({
		tops: [],
		nodes: [],
		rest: { x: 0, y: 0 },
		vw: 1,
		vh: 1,
		mirror: false,
	});
	const pose = useRef<Pose>(restPose());
	const target = useRef<Pose>(restPose());
	const driveOut = useRef<CubeDrive>({
		azimuth: 0,
		elevation: 0,
		spinBoost: 1,
		sheen: SHEEN_STRENGTH,
	});
	const sim = useRef({
		velocity: 0,
		first: true,
		invisibleSince: -1,
		parked: false,
		transform: "",
		opacity: -1,
	});
	const [parked, setParked] = useState(false);

	// Anchor tops are measured here and cached; the frame loop never reads the
	// DOM. Missing anchors are skipped and a later anchor can never sit above
	// an earlier one, so the sampler's segment walk stays monotonic.
	const layout = useCallback(() => {
		const host = hostRef.current;
		if (!host) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const y0 = window.scrollY;
		const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
		const tops: number[] = [];
		const nodes: RouteNode[] = [];
		for (const node of TRAVELER_ROUTE) {
			let top: number;
			if (node.anchor === ROUTE_END) {
				top = maxScroll + (node.offsetVh ?? 0) * vh;
			} else {
				const el = document.getElementById(node.anchor);
				if (!el) continue;
				const r = el.getBoundingClientRect();
				top = r.top + y0 + (node.at === "bottom" ? r.height : 0) + (node.offsetVh ?? 0) * vh;
			}
			if (tops.length > 0 && top < tops[tops.length - 1]) top = tops[tops.length - 1];
			tops.push(top);
			nodes.push(node);
		}
		// The box carries -translate-x-1/2, so its visual centre is its layout
		// left edge; vertically it is the plain centre. Untransformed reads on
		// purpose — the frame loop is already scaling and moving this element.
		frameRef.current = {
			tops,
			nodes,
			rest: { x: host.offsetLeft, y: host.offsetTop + host.offsetHeight / 2 },
			vw,
			vh,
			mirror: document.documentElement.dir === "rtl",
		};
	}, []);

	useEffect(() => {
		layout();
		window.addEventListener("resize", layout);
		// Exhibits mount lazily as they scroll into view and change the document
		// height under the anchors; lenis does not announce that either.
		const ro = new ResizeObserver(layout);
		ro.observe(document.body);
		return () => {
			window.removeEventListener("resize", layout);
			ro.disconnect();
		};
	}, [layout]);

	// Lenis is the one scroll source on the landing page (under reduced motion
	// SmoothScroll renders null, and so does this). Subscribed on the instance
	// directly rather than through useLenis — see the prop note above.
	useEffect(() => {
		if (!lenis) return;
		const onScroll = (l: Lenis) => {
			const s = scrollRef.current;
			s.limit = Math.max(1, l.limit);
			s.scroll = Math.max(0, Math.min(l.scroll, l.limit));
			s.velocity = l.velocity;
		};
		lenis.on("scroll", onScroll);
		onScroll(lenis);
		return () => {
			lenis.off("scroll", onScroll);
		};
	}, [lenis]);

	useAnimationFrame((time, delta) => {
		const host = hostRef.current;
		const f = frameRef.current;
		if (!host || f.nodes.length === 0) return;
		const dt = Math.min(delta / 1000, 0.05);
		const S = sim.current;
		const sc = scrollRef.current;
		const P = pose.current;
		const T = target.current;
		const p = sc.scroll / sc.limit;

		// One damping pass toward the route target, snapped on the first frame
		// so a mid-page reload lands on its pose instead of gliding to it.
		sampleRoute(sc.scroll, f, T);
		const k = S.first ? 1 : 1 - Math.exp(-dt * ROUTE_DAMP);
		P.x += (T.x - P.x) * k;
		P.y += (T.y - P.y) * k;
		P.scale += (T.scale - P.scale) * k;
		P.opacity += (T.opacity - P.opacity) * k;
		P.azimuth += (T.azimuth - P.azimuth) * k;
		P.elevation += (T.elevation - P.elevation) * k;

		// Smoothed speed: lenis emits per step, and the spin boost below would
		// stutter on the raw value between emits.
		const ks = S.first ? 1 : 1 - Math.exp(-dt * SMOOTH_RATE);
		S.velocity += (Math.abs(sc.velocity) - S.velocity) * ks;
		S.first = false;

		const transform = `translate3d(${(P.x - f.rest.x).toFixed(2)}px, ${(P.y - f.rest.y).toFixed(2)}px, 0) scale(${P.scale.toFixed(4)})`;
		if (transform !== S.transform) {
			host.style.transform = transform;
			S.transform = transform;
		}
		if (Math.abs(P.opacity - S.opacity) > 0.002) {
			host.style.opacity = P.opacity.toFixed(3);
			S.opacity = P.opacity;
		}

		// The raw scroll target. The cube smooths it itself, and at exactly zero
		// it runs its own idle cycle instead (see the scrub branch in
		// rubiks-cube.tsx), which is how the top of the page keeps the classic
		// scramble → solve loop.
		const cube = cubeRef.current;
		if (cube) {
			cube.seek(p * moveTotal);
			const d = driveOut.current;
			d.azimuth = P.azimuth;
			d.elevation = P.elevation;
			d.spinBoost = 1 + Math.min(1.5, S.velocity / V_REF);
			// The shimmer runs on the cube's own clock; the host only sets its
			// brightness.
			d.sheen = SHEEN_STRENGTH;
			cube.setDrive(d);
		}

		// Park (demand frameloop) once it has been invisible for a beat — the
		// sealed archive is an opaque plate over it and LightRays is running
		// there. Unpark the instant it is needed again.
		if (P.opacity < PARK_OPACITY) {
			if (S.invisibleSince < 0) S.invisibleSince = time;
			else if (!S.parked && time - S.invisibleSince > PARK_AFTER_MS) {
				S.parked = true;
				setParked(true);
			}
		} else {
			S.invisibleSince = -1;
			if (S.parked) {
				S.parked = false;
				setParked(false);
			}
		}
	});

	return (
		<div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
			{/* Halves the body's measurement grid under the cube. Here, not on
			    <body>, so it is scoped exactly like the traveler: landing, scroll
			    hero, desktop — and it cannot leak to another route on a client
			    navigation the way an html attribute can. The one intended
			    difference from the classic opening at scroll 0. */}
			<div className="absolute inset-0 bg-surface/50" />
			<div
				ref={hostRef}
				className="absolute start-[69%] top-10 h-[min(92svh,108vw)] w-[min(92svh,108vw)] -translate-x-1/2"
			>
				<PreviewBoundary slug="rubiks-cube" label="RubiksCube" variant="silent">
					<RubiksCube
						ref={cubeRef}
						palette={hero.cube.palette}
						glossy
						transparent
						scrambleMoveCount={hero.cube.scrambleMoveCount}
						moveDuration={hero.cube.moveDuration}
						pauseBetweenCycles={hero.cube.pauseBetweenCycles}
						rotationSpeed={hero.cube.rotationSpeed}
						cameraDistance={hero.cube.cameraDistance}
						scrub={scrub}
						maxDpr={1.5}
						paused={parked}
						className="cursor-default!"
					/>
				</PreviewBoundary>
			</div>
		</div>
	);
}
