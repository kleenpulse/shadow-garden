"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
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
// from the middle, so the opening is exactly `d(φ) − rho`. At the defaults that
// is 68 wide open and −24 shut — negative meaning the blades have crossed the
// centre and the iris is light-tight. One number, no circle-circle intersections,
// and the union of the discs gives the scalloped polygon a real iris makes.
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
  /** Strength of the lit edge along each blade. */
  edgeHighlight?: number;
  /** Width of the machined bezel inside the housing rim. */
  housingInset?: number;
  /** Cycle open and shut on its own. */
  autoOpen?: boolean;
  /** Body of the blades. */
  bladeColor?: string;
  /** Lit blade edge and bezel. */
  edgeColor?: string;
  /** Renders at `openness` with no travel and no cycling. */
  reducedMotion?: boolean;
  className?: string;
}

/** Pin ring radius and arm length, in viewBox units. The housing is r = 100. */
const PIVOT = 84;
const ARM = 46;
const BASE_RHO = 62;

/** Where the light comes from, in degrees. Fixed so the metal reads as one part. */
const LIGHT = -55;

// Blade lighting has to be a colour difference, never opacity. Translucent blades
// let whatever is behind the iris read straight through the closed part of the
// mechanism — measured at 0.82 fill-opacity the range rings of the scene below
// were legible across the entire housing, which is not an iris, it is a stencil.
const shade = (hex: string, lift: number) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return hex;
  const up = (c: number) => Math.round(c + (255 - c) * lift);
  return `rgb(${up((n >> 16) & 255)} ${up((n >> 8) & 255)} ${up(n & 255)})`;
};

/** How far past the housing a blade's material extends. */
const REACH = 170;

const phiFor = (openness: number) => Math.PI * (1 - Math.min(1, Math.max(0, openness)));

/** Distance from the iris centre to a blade's arc centre at swing angle φ. */
const dist = (p: number) =>
  Math.sqrt(PIVOT * PIVOT + ARM * ARM + 2 * PIVOT * ARM * Math.cos(p));

export default function Aperture({
  children,
  bladeCount = 6,
  openness = 0.62,
  duration = 900,
  detent = 0.35,
  bladeCurvature = 1,
  edgeHighlight = 0.6,
  housingInset = 6,
  autoOpen = true,
  bladeColor = "#141018",
  edgeColor = "#a855f7",
  reducedMotion = false,
  className,
}: ApertureProps) {
  const phi = useMotionValue(phiFor(openness));
  const rho = BASE_RHO * bladeCurvature;
  // Two irises on one page would otherwise share a clip-path id and one would
  // silently take the other's wedge. Colons are stripped so the id survives
  // `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // Everything the cycling effect reads, mirrored so a control dragged mid-cycle
  // takes effect on the next leg instead of restarting the mechanism.
  const live = useRef({ duration, detent, openness });
  live.current = { duration, detent, openness };

  useEffect(() => {
    // A back-ease: the second control point above 1 overshoots, so the blades
    // seat with a detent instead of arriving dead. Zero gives a plain ease.
    const ease = () => [0.34, 1 + live.current.detent, 0.64, 1] as [number, number, number, number];

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

  const blades = Array.from({ length: Math.max(3, Math.round(bladeCount)) }, (_, i) => i);

  // Slightly wider than an even share of the circle, so neighbouring leaves
  // overlap and each one visibly slides under the next instead of butting up
  // against it along a seam.
  const psi = ((180 / blades.length) * 1.35 * Math.PI) / 180;
  const wedge =
    `M0 0L${(REACH * Math.cos(-psi)).toFixed(2)} ${(REACH * Math.sin(-psi)).toFixed(2)}` +
    `A${REACH} ${REACH} 0 0 1 ${(REACH * Math.cos(psi)).toFixed(2)} ${(REACH * Math.sin(psi)).toFixed(2)}Z`;

  return (
    // The housing is its own material, not a themed surface — it takes the blade
    // colour rather than `bg-surface`, so a light theme cannot put a white ring
    // behind an iris. Same reasoning as the code panel staying graphite.
    <div
      className={cn("relative aspect-square overflow-hidden rounded-full", className)}
      style={{ backgroundColor: bladeColor }}
    >
      <div className="absolute inset-0">{children}</div>

      <svg
        viewBox="-100 -100 200 200"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          {/* A blade is not a disc. Trim each one to its own wedge and you get a
              leaf that slides under its neighbour; leave it whole and the closed
              iris reads as a pile of overlapping circles, because that is what it
              is. The wedge is authored on the +x axis and inherits each blade's
              rotation, so one definition serves all of them. */}
          <clipPath id={`${uid}-leaf`} clipPathUnits="userSpaceOnUse">
            <path d={wedge} />
          </clipPath>
        </defs>

        {blades.map((i) => (
          <Blade
            key={i}
            index={i}
            count={blades.length}
            phi={phi}
            rho={rho}
            clip={`${uid}-leaf`}
            fill={bladeColor}
            edge={edgeColor}
            edgeOpacity={edgeHighlight}
          />
        ))}

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

// One component per blade so each owns its own useTransform — deriving them in
// the parent's map would call a hook inside a loop.
function Blade({
  index,
  count,
  phi,
  rho,
  clip,
  fill,
  edge,
  edgeOpacity,
}: {
  index: number;
  count: number;
  phi: MotionValue<number>;
  rho: number;
  clip: string;
  fill: string;
  edge: string;
  edgeOpacity: number;
}) {
  const theta = (index * 360) / count;
  const cx = useTransform(phi, (p) => PIVOT + ARM * Math.cos(p));
  const cy = useTransform(phi, (p) => ARM * Math.sin(p));

  // The blade needs a root, because the arc alone cannot reach the housing. Shut,
  // the disc spans exactly to the rim along its own axis and falls short of it
  // everywhere else — which showed up as triangular notches around the edge of a
  // supposedly light-tight iris.
  //
  // The root runs from d(φ) outward, and d(φ) is the arc's CENTRE — always a full
  // `rho` outside the opening, at every angle. So it can never intrude on the
  // hole, and the scalloped polygon the arcs cut is left intact. Drawn as a thick
  // stroked circle, which is an annulus; the leaf clip trims it to this blade.
  const rootR = useTransform(phi, (p) => (dist(p) + REACH) / 2);
  const rootW = useTransform(phi, (p) => Math.max(0, REACH - dist(p)));

  // Blades all share one fill, so the only thing separating them is how each one
  // takes the light. Without this the iris is a single black blob with a hole.
  const lit = 0.5 + 0.5 * Math.cos(((theta - LIGHT) * Math.PI) / 180);

  return (
    // The clip sits on an inner group so it resolves in the rotated user space —
    // the wedge turns with the blade rather than staying pinned to +x.
    <g transform={`rotate(${theta})`}>
      <g clipPath={`url(#${clip})`}>
        <motion.circle
          cx="0"
          cy="0"
          r={rootR}
          fill="none"
          stroke={shade(fill, 0.02 + 0.1 * lit)}
          strokeWidth={rootW}
        />
        <motion.circle
          cx={cx}
          cy={cy}
          r={rho}
          fill={shade(fill, 0.02 + 0.1 * lit)}
          stroke={edge}
          strokeOpacity={edgeOpacity * (0.35 + 0.65 * lit)}
          strokeWidth="0.8"
        />
      </g>
    </g>
  );
}
