"use client";

import { memo, useCallback, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

// A sticker you take off by the corner.
//
// Three decisions carry the component.
//
// **The fold is real geometry, not a rotation.** Dragging a corner to a point
// folds the sheet along the perpendicular bisector of those two positions —
// that is the only line where the paper can bend and still have the corner land
// where the hand is. Everything else falls out of it: the front face is the
// sheet clipped to one side of that line, and the flap is the other side
// reflected across it.
//
// **The backside is one reflection, not a second layout.** The flap renders the
// same content clipped to the *unfolded* region and carries a reflection matrix,
// so the mirroring, the position and the fold angle are all one transform the
// compositor can do. Building a separately-positioned mirrored copy means two
// things that have to agree, and they stop agreeing at the corners.
//
// **Nothing recomputes in React.** The pull is a pair of motion values and every
// derived string — both clip polygons, the reflection matrix, the shadows —
// hangs off them through `useTransform`, so a drag never re-renders the tree. It
// is the difference between a fold that tracks the finger and one that arrives
// a frame late with a sixty-node reconciliation behind it.
export type PeelContent = "badge" | "label" | "holo";
export type PeelCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface PeelProps {
  /** How much the sheet fights the pull. */
  resistance?: number;
  /** Width of the specular band along the fold. */
  curl?: number;
  /** Fraction of the diagonal that commits the peel. */
  threshold?: number;
  /** Snap-back and commit spring. */
  stiffness?: number;
  /** Snap-back and commit spring. */
  damping?: number;
  /** Strength of the shadow the lifted flap casts. */
  shadow?: number;
  /** How much darker the backside is than the face. */
  backDim?: number;
  /** What is printed on the sticker. */
  content?: PeelContent;
  /** Which corner lifts. */
  corner?: PeelCorner;
  /** Sticker edge. */
  size?: number;
  /** Badge glyph and foil hue. */
  accent?: string;
  /** No springs and no flight — the sticker snaps between stuck and free. */
  reducedMotion?: boolean;
  className?: string;
}

type Point = [number, number];

const cornerPoint = (corner: PeelCorner, s: number): Point => {
  if (corner === "top-left") return [0, 0];
  if (corner === "top-right") return [s, 0];
  if (corner === "bottom-left") return [0, s];
  return [s, s];
};

/** Sutherland-Hodgman against a single half-plane. One plane is all a fold ever
 *  needs, and clipping a convex quad by one line can only ever produce three to
 *  five vertices — no general polygon code required. */
const clipHalf = (poly: Point[], m: Point, d: Point, keep: 1 | -1): Point[] => {
  const side = (p: Point) => keep * ((p[0] - m[0]) * d[0] + (p[1] - m[1]) * d[1]);
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
};

const toPolygon = (poly: Point[]): string =>
  poly.length < 3
    ? "polygon(0px 0px, 0px 0px, 0px 0px)"
    : `polygon(${poly.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(", ")})`;

interface Fold {
  /** 0 flat on the surface, approaching 1 as the sheet folds fully back. */
  progress: number;
  front: string;
  back: string;
  matrix: string;
  /** Fold midpoint and angle, for the specular band. */
  mx: number;
  my: number;
  deg: number;
}

const flat = (s: number): Fold => ({
  progress: 0,
  front: `polygon(0px 0px, ${s}px 0px, ${s}px ${s}px, 0px ${s}px)`,
  back: "polygon(0px 0px, 0px 0px, 0px 0px)",
  matrix: "matrix(1, 0, 0, 1, 0, 0)",
  mx: 0,
  my: 0,
  deg: 0,
});

const solve = (
  rawX: number,
  rawY: number,
  s: number,
  corner: PeelCorner,
  resistance: number,
): Fold => {
  const diag = s * Math.SQRT2;
  const dist = Math.hypot(rawX, rawY);
  if (dist < 0.5) return flat(s);

  // Asymptotic rather than divided: the pull approaches a full diagonal however
  // hard the sheet resists, so the commit threshold stays reachable at every
  // setting. A `d / (1 + k·d)` law caps out below the threshold at high
  // resistance and silently makes the sticker impossible to remove.
  const scale = diag * (0.4 + resistance * 0.9);
  const pulled = diag * (1 - Math.exp(-dist / scale));

  const [cx, cy] = cornerPoint(corner, s);
  const px = cx + (rawX / dist) * pulled;
  const py = cy + (rawY / dist) * pulled;

  const mx = (cx + px) / 2;
  const my = (cy + py) / 2;
  const dx = (px - cx) / pulled;
  const dy = (py - cy) / pulled;

  const box: Point[] = [
    [0, 0],
    [s, 0],
    [s, s],
    [0, s],
  ];

  const front = clipHalf(box, [mx, my], [dx, dy], 1);
  const back = clipHalf(box, [mx, my], [dx, dy], -1);

  // Reflection across the fold. Determinant is -1, which is what mirrors the
  // artwork — a backside that reads the right way round is a backside nobody
  // believes.
  const a = 1 - 2 * dx * dx;
  const b = -2 * dx * dy;
  const c = -2 * dx * dy;
  const dd = 1 - 2 * dy * dy;
  const tx = mx - (a * mx + c * my);
  const ty = my - (b * mx + dd * my);

  return {
    progress: pulled / diag,
    front: toPolygon(front),
    back: toPolygon(back),
    matrix: `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}, ${dd.toFixed(5)}, ${tx.toFixed(3)}, ${ty.toFixed(3)})`,
    mx,
    my,
    deg: Math.atan2(dy, dx) * (180 / Math.PI) + 90,
  };
};

const Face = ({
  content,
  accent,
  size,
}: {
  content: PeelContent;
  accent: string;
  size: number;
}) => {
  if (content === "label") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-raised">
        <span
          className="font-display text-center text-[11px] leading-relaxed tracking-[0.3em] uppercase"
          style={{ color: accent }}
        >
          Shadow
          <br />
          Garden
        </span>
      </div>
    );
  }
  if (content === "holo") {
    return (
      <div
        className="h-full w-full"
        style={{
          background: `conic-gradient(from 210deg at 50% 50%, ${accent}, #38bdf8, #f472b6, #fbbf24, ${accent})`,
        }}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-raised">
      <svg viewBox="0 0 24 24" width={size * 0.42} height={size * 0.42}>
        <path
          d="M12 2.5 L20 7 L20 15 L12 21.5 L4 15 L4 7 Z"
          fill="none"
          stroke={accent}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M12 7.5 L16 10 L16 14 L12 16.5 L8 14 L8 10 Z" fill={accent} opacity="0.85" />
      </svg>
    </div>
  );
};

const Peel = memo(
  ({
    resistance = 0.45,
    curl = 48,
    threshold = 0.6,
    stiffness = 320,
    damping = 22,
    shadow = 0.6,
    backDim = 0.35,
    content = "badge",
    corner = "bottom-right",
    size = 180,
    accent = "#a855f7",
    reducedMotion = false,
    className,
  }: PeelProps) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const armed = useRef(false);
    const busy = useRef(false);

    const rawX = useMotionValue(0);
    const rawY = useMotionValue(0);
    const flyX = useMotionValue(0);
    const flyY = useMotionValue(0);
    const flyRot = useMotionValue(0);

    const fold = useTransform([rawX, rawY], ([x, y]) =>
      solve(x as number, y as number, size, corner, resistance),
    );

    const frontClip = useTransform(fold, (f) => f.front);
    const backClip = useTransform(fold, (f) => f.back);
    const backMatrix = useTransform(fold, (f) => f.matrix);
    // Emitted as px strings rather than bare numbers: `left` and `top` are
    // plain CSS properties here, not motion's own transform channels, so
    // nothing downstream is going to add the unit for them.
    const bandLeft = useTransform(fold, (f) => `${f.mx.toFixed(2)}px`);
    const bandTop = useTransform(fold, (f) => `${f.my.toFixed(2)}px`);
    const bandRotate = useTransform(fold, (f) => f.deg);
    const lift = useTransform(fold, (f) => Math.min(1, f.progress));
    const flapShadow = useTransform(
      lift,
      (v) => `drop-shadow(0 ${(v * 14).toFixed(1)}px ${(v * 18 + 4).toFixed(1)}px rgba(0,0,0,${(v * shadow * 0.7).toFixed(3)}))`,
    );

    const spring = useCallback(
      (x: number, y: number, velocity = 0) => {
        if (reducedMotion) {
          rawX.set(x);
          rawY.set(y);
          return Promise.resolve();
        }
        const opts = { type: "spring" as const, stiffness, damping, velocity };
        return Promise.all([
          animate(rawX, x, opts).finished,
          animate(rawY, y, opts).finished,
        ]);
      },
      [damping, rawX, rawY, reducedMotion, stiffness],
    );

    const restick = useCallback(async () => {
      // The demo has to survive being watched. Committing and then staying gone
      // leaves a dead panel, so the sticker flies off, hangs, and comes back
      // down onto its own printed outline.
      const away = corner.includes("right") ? 1 : -1;
      if (reducedMotion) {
        rawX.set(0);
        rawY.set(0);
        busy.current = false;
        return;
      }
      await Promise.all([
        animate(flyX, away * size * 0.55, { duration: 0.42, ease: [0.3, 0, 0.2, 1] }).finished,
        animate(flyY, -size * 0.42, { duration: 0.42, ease: [0.3, 0, 0.2, 1] }).finished,
        animate(flyRot, away * 13, { duration: 0.42, ease: "easeOut" }).finished,
      ]);
      await new Promise((r) => setTimeout(r, 900));
      // The fold unwinds on the way down rather than being reset first. Clearing
      // the pull before the flight home snaps the sticker flat in one frame,
      // mid-air, which is the one moment the whole illusion is most visible.
      const back = { type: "spring" as const, stiffness: 260, damping: 20 };
      await Promise.all([
        animate(rawX, 0, back).finished,
        animate(rawY, 0, back).finished,
        animate(flyX, 0, back).finished,
        animate(flyY, 0, back).finished,
        animate(flyRot, 0, { type: "spring", stiffness: 260, damping: 18 }).finished,
      ]);
      busy.current = false;
    }, [corner, flyRot, flyX, flyY, rawX, rawY, reducedMotion, size]);

    const onPanStart = (event: MouseEvent | TouchEvent | PointerEvent) => {
      if (busy.current) return;
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const p = "clientX" in event ? event : event.changedTouches[0];
      const lx = p.clientX - rect.left;
      const ly = p.clientY - rect.top;
      const [cx, cy] = cornerPoint(corner, size);
      // A generous corner, because a sticker is picked up by feel and a precise
      // hit target for a physical gesture reads as the component being broken.
      armed.current = Math.hypot(lx - cx, ly - cy) < size * 0.62;
    };

    const onPan = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: { offset: { x: number; y: number } },
    ) => {
      if (!armed.current || busy.current) return;
      rawX.set(info.offset.x);
      rawY.set(info.offset.y);
    };

    const onPanEnd = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: { offset: { x: number; y: number }; velocity: { x: number; y: number } },
    ) => {
      if (!armed.current || busy.current) return;
      armed.current = false;

      const committed = fold.get().progress >= threshold;
      if (!committed) {
        void spring(0, 0, Math.hypot(info.velocity.x, info.velocity.y) * -0.2);
        return;
      }

      busy.current = true;
      const dist = Math.hypot(info.offset.x, info.offset.y) || 1;
      const reach = size * 6;
      void spring((info.offset.x / dist) * reach, (info.offset.y / dist) * reach).then(
        restick,
      );
    };

    const radius = Math.round(size * 0.09);

    return (
      <div
        // select-none because the label face is text under the drag: a drag that
        // starts on selected text becomes a native drag-and-drop, the browser
        // answers with pointercancel, and the fold stops dead mid-peel.
        className={`relative flex items-center justify-center select-none ${className ?? ""}`}
        style={{ width: size * 1.9, height: size * 1.9 }}
      >
        <div className="absolute inset-0 rounded-2xl border border-hairline bg-panel" />

        {/* Where the sticker belongs. Without the printed outline, a peeled
            sticker is just an object floating on a slab. */}
        <div
          className="absolute border border-dashed border-hairline"
          style={{ width: size, height: size, borderRadius: radius }}
        />

        <motion.div
          ref={rootRef}
          className="absolute touch-none"
          style={{ width: size, height: size, x: flyX, y: flyY, rotate: flyRot }}
          onPanStart={onPanStart}
          onPan={onPan}
          onPanEnd={onPanEnd}
        >
          {/* The flap. Clipped in its own untransformed coordinates and then
              reflected, so one matrix does the mirroring and the placement. */}
          <motion.div
            className="absolute inset-0 overflow-hidden"
            style={{
              clipPath: backClip,
              transform: backMatrix,
              filter: flapShadow,
              borderRadius: radius,
            }}
          >
            <div
              className="h-full w-full"
              style={{ filter: `brightness(${1 - backDim})` }}
            >
              <Face content={content} accent={accent} size={size} />
            </div>
            {/* The curl. A band sitting on the fold line, which the reflection
                leaves exactly where it was — the fold is the one line the
                mirror does not move. */}
            <motion.div
              className="pointer-events-none absolute"
              style={{
                left: bandLeft,
                top: bandTop,
                width: size * 1.6,
                height: curl,
                x: "-50%",
                y: "-50%",
                rotate: bandRotate,
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.42) 48%, rgba(255,255,255,0.06) 62%, rgba(0,0,0,0.28) 100%)",
              }}
            />
          </motion.div>

          {/* The face still stuck down. */}
          <motion.div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: frontClip, borderRadius: radius }}
          >
            <Face content={content} accent={accent} size={size} />
            <motion.div
              className="pointer-events-none absolute"
              style={{
                left: bandLeft,
                top: bandTop,
                width: size * 1.6,
                height: curl * 0.9,
                x: "-50%",
                y: "-50%",
                rotate: bandRotate,
                opacity: lift,
                background: `linear-gradient(to top, rgba(0,0,0,${(shadow * 0.55).toFixed(3)}) 0%, rgba(0,0,0,0) 100%)`,
              }}
            />
          </motion.div>
        </motion.div>
      </div>
    );
  },
);

Peel.displayName = "Peel";

export default Peel;
