"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// A camera iris. N blades pivot on a ring of pins and one shared angle drives the
// whole mechanism, exactly as the real part does.
//
// The geometry collapses to something much smaller than it looks. A blade is a
// disc of radius `rho` whose centre is pinned at radius `pivot` and swings on an
// arm of length `arm`. Rotating every blade about its own pin by φ puts each
// centre at distance
//
//     d(φ) = √(pivot² + arm² + 2·pivot·arm·cos φ)
//
// from the middle, so the opening is exactly `d(φ) − rho`. One number, no
// circle-circle intersections, and the union of the discs gives the scalloped
// polygon a real iris makes. Every blade reads the same two numbers — the swing
// only ever enters through a rotation — so there is exactly one motion value pair
// on the page no matter how many leaves there are.
//
// Two things have to be right, and both were wrong in an earlier pass.
//
// The SCALE of `rho`. A blade whose arc is only a little flatter than the housing
// cuts a six-pointed star, not a hexagon — the hole's vertices land 1.6× its
// inscribed radius. Real leaves are far flatter than the barrel they sit in, and
// once `rho` is drawn to that scale every disc's FAR arc falls outside the housing
// at every swing angle. A single clip to the housing circle then leaves exactly
// the near arc and nothing else: no per-blade wedge, no root filler, no
// half-circle dash offset. All three of those existed to work around `rho` being
// too small.
//
// And the ORDER. See the mask below — it is the whole reason this file has masks
// in it.
//
// The centre is computed as `cx`/`cy` rather than as a CSS rotation about a
// transform-origin. Both work in Chromium and Firefox, but `transform-box:
// view-box` on an SVG child has no precedent in this codebase and would need
// verifying in Safari before it could be trusted. Arithmetic needs verifying
// nowhere.
export interface ApertureProps {
	/** Sits behind the blades and shows through the opening. */
	children?: ReactNode;
	/** How many blades in the mechanism. */
	bladeCount?: number;
	/** 0 shut, 1 wide open. Ignored while the iris is cycling on its own. */
	openness?: number;
	/** Travel time of one open or close, in ms. */
	duration?: number;
	/** Overshoot as the mechanism seats, 0 for none. */
	detent?: number;
	/** Curvature of a blade's inner edge. Higher is flatter and more polygonal. */
	bladeCurvature?: number;
	/** Strength of the lit seam along each blade. */
	edgeHighlight?: number;
	/** Width of the machined bezel inside the housing rim. */
	housingInset?: number;
	/** Cycle open and shut on its own. */
	autoOpen?: boolean;
	/** Body of the blades. */
	bladeColor?: string;
	/** Lit blade seams and bezel. */
	edgeColor?: string;
	/** Renders at `openness` with no travel and no cycling. */
	reducedMotion?: boolean;
	className?: string;
}

/** Blade arc radius at curvature 1, in viewBox units. The housing is r = 100. */
const BASE_RHO = 160;

// The mechanism is derived from the opening range rather than the other way
// round, so `bladeCurvature` bends the leaf without quietly retuning the travel.
// d(φ) spans pivot ± arm, so the opening spans these two numbers for every rho.
/** Shut. Negative: the blades cross past the centre, so the iris is light-tight. */
const OPEN_MIN = -5;
/** Wide open, as a fraction of the r = 100 housing. */
const OPEN_MAX = 64;

/** Where the light comes from, in degrees. Fixed so the metal reads as one part. */
const LIGHT = -55;

/** How far out the barrel floor runs before the housing clip takes over. */
const FLOOR_OUT = 300;

const phiFor = (openness: number) =>
	Math.PI * (1 - Math.min(1, Math.max(0, openness)));

/** Distance from the iris centre to a blade's arc centre at swing angle φ. */
const dist = (p: number, pivot: number, arm: number) =>
	Math.sqrt(pivot * pivot + arm * arm + 2 * pivot * arm * Math.cos(p));

export default function Aperture({
	children,
	bladeCount = 8,
	openness = 0.62,
	duration = 900,
	detent = 0.35,
	bladeCurvature = 1,
	edgeHighlight = 0.6,
	housingInset = 6,
	autoOpen = true,
	bladeColor = "#26232c",
	edgeColor = "#000000",
	reducedMotion = false,
	className,
}: ApertureProps) {
	const phi = useMotionValue(phiFor(openness));

	const rho = BASE_RHO * bladeCurvature;
	const arm = (OPEN_MAX - OPEN_MIN) / 2;
	const pivot = rho + (OPEN_MAX + OPEN_MIN) / 2;

	const count = Math.max(3, Math.round(bladeCount));
	const blades = Array.from({ length: count }, (_, i) => i);
	const angle = (i: number) => (i * 360) / count;

	// Two irises on one page would otherwise share their def ids and one would
	// silently take the other's clip. Colons are stripped so the id survives
	// `url(#…)`.
	const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

	// One pair for every blade: each leaf is the same disc under a different
	// rotation, so the swing is shared and only the transform differs.
	const cx = useTransform(phi, (p) => pivot + arm * Math.cos(p));
	const cy = useTransform(phi, (p) => arm * Math.sin(p));

	// Everything the cycling effect reads, mirrored so a control dragged mid-cycle
	// takes effect on the next leg instead of restarting the mechanism.
	const live = useRef({ duration, detent, openness });
	live.current = { duration, detent, openness };

	useEffect(() => {
		// A back-ease: the second control point above 1 overshoots, so the blades
		// seat with a detent instead of arriving dead. Zero gives a plain ease.
		const ease = () =>
			[0.34, 1 + live.current.detent, 0.64, 1] as [
				number,
				number,
				number,
				number,
			];

		if (reducedMotion || !autoOpen) {
			// Every exit from this effect commits the blades to a definite position.
			// There is no ordering of prop changes that can strand the iris shut over
			// content it is supposed to be revealing.
			animate(
				phi,
				phiFor(live.current.openness),
				reducedMotion
					? { duration: 0 }
					: { duration: live.current.duration / 1000, ease: ease() },
			);
			return;
		}

		let alive = true;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const leg = (open: boolean) => {
			void animate(phi, phiFor(open ? 0.95 : 0.08), {
				duration: live.current.duration / 1000,
				ease: ease(),
			}).then(() => {
				if (!alive) return;
				timer = setTimeout(() => {
					if (alive) leg(!open);
				}, 720);
			});
		};
		leg(true);

		return () => {
			alive = false;
			if (timer !== null) clearTimeout(timer);
		};
	}, [autoOpen, reducedMotion, openness, duration, phi]);

	// Where two neighbouring arcs cross — the corner of the scalloped polygon, and
	// so the widest the opening ever gets at any angle. Both arcs are symmetric
	// about the bisector between their pins, which is where they must meet, so this
	// is a quadratic in one unknown rather than a circle-circle intersection.
	//
	// The root is imaginary exactly when neighbouring leaves no longer overlap —
	// low blade counts, wide open. There is no scallop to preserve then, so fall
	// back to the inscribed radius and let the floor cover the slots.
	const vertexR = (p: number) => {
		const d = dist(p, pivot, arm);
		const s = Math.sin(Math.PI / count);
		const under = rho * rho - d * d * s * s;
		const r =
			under > 0 ? d * Math.cos(Math.PI / count) - Math.sqrt(under) : d - rho;
		return Math.max(0, r);
	};

	// The lens barrel behind the blades. Without it, the gaps between retracted
	// leaves are windows onto the content, which no lens has ever done — the
	// content must only ever appear through the hole itself. Drawn as a thick
	// stroked circle, which is an annulus running from the opening's corner
	// outward; the housing clip trims the far side.
	const floorR = useTransform(phi, (p) => (vertexR(p) + FLOOR_OUT) / 2);
	const floorW = useTransform(phi, (p) => FLOOR_OUT - vertexR(p));

	const lightRad = (LIGHT * Math.PI) / 180;
	const lx = Math.cos(lightRad) * 100;
	const ly = Math.sin(lightRad) * 100;

	/** How brightly a leaf at this angle takes the fixed light. */
	const litAt = (i: number) =>
		0.5 + 0.5 * Math.cos(((angle(i) - LIGHT) * Math.PI) / 180);

	return (
		// The housing is its own material, not a themed surface — it takes the blade
		// colour rather than `bg-surface`, so a light theme cannot put a white ring
		// behind an iris. Same reasoning as the code panel staying graphite.
		<div
			className={cn(
				"relative aspect-square overflow-hidden rounded-full",
				className,
			)}
			style={{ backgroundColor: bladeColor }}
		>
			<div className="absolute inset-0">{children}</div>

			<svg
				viewBox="-100 -100 200 200"
				className="absolute inset-0 h-full w-full"
				aria-hidden
			>
				<defs>
					<clipPath id={`${uid}-housing`} clipPathUnits="userSpaceOnUse">
						<circle cx="0" cy="0" r="100" />
					</clipPath>

					{/* One sheen across the whole leaf field rather than a lift per blade.
					    The leaves are one machined part catching one light; tinting each
					    disc on its own reads as a stack of separate discs, which is the
					    thing the mechanism is trying not to look like. It also keeps the
					    leaves indistinguishable except by their seams — as in the real
					    part, where the blades are one pressed material and only the edges
					    catch anything. */}
					<linearGradient
						id={`${uid}-sheen`}
						gradientUnits="userSpaceOnUse"
						x1={lx}
						y1={ly}
						x2={-lx}
						y2={-ly}
					>
						<stop offset="0" stopColor="#ffffff" stopOpacity="0.08" />
						<stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
						<stop offset="1" stopColor="#000000" stopOpacity="0.24" />
					</linearGradient>

					{/* Each leaf's seam, cut by the leaf that lies over it.

					    Burial is what edits these arcs down to one line per corner: a leaf
					    stack is a RING, every leaf under exactly one neighbour. Painter's
					    order is a line, so drawing the leaves in sequence cannot express
					    that — the last leaf has nothing above it and the first has
					    everything. Wide open the error hides, because each disc spans only
					    ~40° of the housing and a leaf never reaches past its neighbour.
					    Shut it is glaring: `d` falls below `rho`, each disc swallows the
					    centre and covers all but a crescent of the housing, so the first
					    leaf is buried six times over and the last not at all. Half the
					    mechanism loses its seams and the other half keeps one enormous
					    unbroken arc.

					    Naming the cut instead of leaning on the stack makes it cyclic, and
					    every leaf identical, at every openness. Drawing a leaf's body twice
					    to close the ring does NOT fix this — it repairs the wrap and leaves
					    the other N−2 leaves buried a different number of times each. */}
					{blades.map((i) => (
						<mask
							key={i}
							id={`${uid}-cut-${i}`}
							maskUnits="userSpaceOnUse"
							x="-100"
							y="-100"
							width="200"
							height="200"
						>
							<rect
								x="-100"
								y="-100"
								width="200"
								height="200"
								fill="#ffffff"
							/>
							<g transform={`rotate(${angle((i + 1) % count)})`}>
								<motion.circle cx={cx} cy={cy} r={rho} fill="#000000" />
							</g>
						</mask>
					))}
				</defs>

				<g clipPath={`url(#${uid}-housing)`}>
					<motion.circle
						cx="0"
						cy="0"
						r={floorR}
						fill="none"
						stroke={bladeColor}
						strokeWidth={floorW}
					/>

					{/* Bodies. One flat colour, so nothing in the stacking order can show
					    — only the union of the discs is visible, and that union is the
					    same whatever sequence paints it. */}
					{blades.map((i) => (
						<g key={i} transform={`rotate(${angle(i)})`}>
							<motion.circle cx={cx} cy={cy} r={rho} fill={bladeColor} />
						</g>
					))}

					{/* Over the bodies, under the seams, so the seams stay crisp. The
					    gradient is transparent at its midpoint, which is the centre of the
					    iris, so the opening is not tinted — only the metal around it. */}
					<rect
						x="-100"
						y="-100"
						width="200"
						height="200"
						fill={`url(#${uid}-sheen)`}
					/>

					{blades.map((i) => (
						<g key={i} mask={`url(#${uid}-cut-${i})`}>
							<g transform={`rotate(${angle(i)})`}>
								{/* The whole circle is stroked and the housing clip does the
								    editing. `rho` is large enough that the far side of every
								    blade arc sits outside r = 100 at every swing angle, so
								    what survives is one arc: the leaf's inner edge, running
								    from the corner of the opening out to the rim.

								    The lit term modulates the seam, it does not gate it. At a
								    0.35 floor the leaves on the unlit side lost their seams
								    entirely and that half of the mechanism collapsed into one
								    grey mass — the very failure the seams exist to prevent,
								    reintroduced as a lighting effect. */}
								<motion.circle
									cx={cx}
									cy={cy}
									r={rho}
									fill="none"
									stroke={edgeColor}
									strokeOpacity={edgeHighlight * (0.62 + 0.38 * litAt(i))}
									strokeWidth="1"
								/>
							</g>
						</g>
					))}
				</g>

				{/* Machined bezel inside the rim. Drawn over the blades so the housing
            reads as the part they are seated in rather than one more leaf. */}
				<circle
					cx="0"
					cy="0"
					r={100 - housingInset / 2}
					fill="none"
					stroke={bladeColor}
					strokeWidth={housingInset}
				/>
				<circle
					cx="0"
					cy="0"
					r={100 - housingInset}
					fill="none"
					stroke={edgeColor}
					strokeOpacity={edgeHighlight * 0.5}
					strokeWidth="0.7"
				/>
			</svg>
		</div>
	);
}
