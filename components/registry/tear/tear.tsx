"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A ticket with a perforated stub you tear off for real. The trick that makes
// the tear look mechanical instead of like a crossfade: the ticket is drawn
// twice. An "attached" layer holds everything still connected — the main body
// plus the stub below the tear front — and a "flap" layer holds only the stub
// above the front, rotated about the frontmost still-attached point. Both are
// cut from one seeded jag polygon, so the torn edges mate tooth for tooth and
// the flap's swing can never overlap the body: the region that would overlap
// is clipped out of the flap by construction.
//
// The jag array is generated once per (teeth, jag) from a seeded PRNG.
// Regenerating it per render would make the torn edge boil — a new random
// coastline sixty times a second — which is exactly the artifact this file
// exists to avoid.
//
// All physics — resistance while dragging, spring-back on a failed tear, the
// freed stub falling under gravity — run as one self-halting state machine on
// the animation-loop host: at rest it returns false and costs nothing.

export interface TearProps {
  /** Where the seam sits across the ticket. */
  perforationAt?: number;
  /** Roughness of the torn edge — 0 is a die-cut, 1 is a bad day. */
  jag?: number;
  /** Perforation tooth count; also the resolution of the torn edge. */
  teeth?: number;
  /** How hard the seam fights before it lets go. */
  resistance?: number;
  /** How fast the freed stub falls away. */
  gravity?: number;
  /** Heal the ticket after the stub is gone. */
  autoReset?: boolean;
  /** Dwell before the ticket heals. */
  resetDelay?: number;
  /** The ticket's printed ink — title, seat block, barcode. */
  inkColor?: string;
  /** Fires once each time the stub comes free. */
  onTear?: () => void;
  reducedMotion?: boolean;
  className?: string;
}

type Phase = "idle" | "dragging" | "springback" | "autotear" | "falling" | "gone";

/** Deterministic PRNG — the same seed always cuts the same edge. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const buildJag = (teeth: number, jag: number): number[] => {
  const rand = mulberry32(7);
  const offsets: number[] = [0];
  for (let i = 1; i < teeth; i++) offsets.push((rand() - 0.5) * 2 * jag * 6);
  offsets.push(0);
  return offsets;
};

/** The printed face, rendered once per layer so both cuts show one ticket. */
const TicketFace = ({ ink, at }: { ink: string; at: number }) => (
  <div className="absolute inset-0 overflow-hidden rounded-lg">
    <div
      className="absolute inset-y-0 left-0 flex flex-col justify-between p-4"
      style={{ width: `${at * 100}%` }}
    >
      <div>
        <p
          className="font-display text-lg leading-none font-bold tracking-[0.08em]"
          style={{ color: ink }}
        >
          ADMIT ONE
        </p>
        <p className="mt-1.5 font-mono text-[9px] tracking-[0.24em] text-[#8b87a0] uppercase">
          Shadow Garden · Hall C
        </p>
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-[#6e6a82]">
        ROW 07 · SEAT 21
      </p>
    </div>
    {/* The perforation lives on the face, so each layer carries its own share
        of the dashes and they separate with the tear. */}
    <div
      className="absolute inset-y-0 border-l-2 border-dashed"
      style={{
        left: `${at * 100}%`,
        borderColor: `color-mix(in oklab, ${ink} 40%, transparent)`,
      }}
    />
    <div
      className="absolute inset-y-0 flex flex-col items-center justify-between py-4"
      style={{ left: `${at * 100}%`, right: 0 }}
    >
      <p className="font-mono text-[9px] tracking-[0.2em] text-[#8b87a0]">No. 0921</p>
      <div className="flex h-10 items-stretch gap-[3px] px-3">
        {[3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2].map((w, i) => (
          <div key={i} style={{ width: w, background: ink, opacity: 0.85 }} />
        ))}
      </div>
      <p className="font-mono text-[9px] tracking-[0.3em] text-[#6e6a82]">STUB</p>
    </div>
  </div>
);

const Tear = ({
  perforationAt = 0.62,
  jag = 0.6,
  teeth = 26,
  resistance = 0.6,
  gravity = 1,
  autoReset = true,
  resetDelay = 1800,
  inkColor = "#c4b5fd",
  onTear,
  reducedMotion = false,
  className = "",
}: TearProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const attachedRef = useRef<HTMLDivElement | null>(null);
  const flapRef = useRef<HTMLDivElement | null>(null);

  const jagOffsets = useMemo(() => buildJag(Math.round(teeth), jag), [teeth, jag]);

  const live = useRef({
    perforationAt,
    resistance,
    gravity,
    autoReset,
    resetDelay,
    reducedMotion,
    jagOffsets,
    onTear,
  });
  live.current = {
    perforationAt,
    resistance,
    gravity,
    autoReset,
    resetDelay,
    reducedMotion,
    jagOffsets,
    onTear,
  };

  const sim = useRef({
    phase: "idle" as Phase,
    w: 0,
    h: 0,
    front: 0, // tear progress 0..1 down the seam
    frontV: 0,
    drive: 0, // raw drag distance, px
    startX: 0,
    startY: 0,
    samples: [] as Array<{ t: number; x: number; y: number }>,
    // free-fall state of the released stub
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    rotV: 0,
    fallT: 0,
    healLeft: 0,
    lastAttached: "",
    lastFlap: "",
  });

  /** Seam x at a given height fraction, jag included. Ticket-local px. */
  const seamX = (f: number) => {
    const s = sim.current;
    const offs = live.current.jagOffsets;
    const seam = s.w * live.current.perforationAt;
    const scaled = f * (offs.length - 1);
    const i = Math.min(offs.length - 2, Math.floor(scaled));
    const frac = scaled - i;
    return seam + offs[i] + (offs[i + 1] - offs[i]) * frac;
  };

  const applyClips = () => {
    const s = sim.current;
    const attached = attachedRef.current;
    const flap = flapRef.current;
    if (!attached || !flap || s.w <= 0) return;
    const offs = live.current.jagOffsets;
    const n = offs.length - 1;
    const f = Math.min(Math.max(s.front, 0), 1);
    const frontY = f * s.h;

    // Attached: the full body, plus the stub below the front.
    const a: string[] = [`0px 0px`, `${seamX(0).toFixed(1)}px 0px`];
    const kMax = Math.floor(f * n);
    for (let k = 1; k <= kMax; k++) {
      a.push(`${(s.w * live.current.perforationAt + offs[k]).toFixed(1)}px ${((k / n) * s.h).toFixed(1)}px`);
    }
    a.push(`${seamX(f).toFixed(1)}px ${frontY.toFixed(1)}px`);
    a.push(`${s.w}px ${frontY.toFixed(1)}px`);
    a.push(`${s.w}px ${s.h}px`, `0px ${s.h}px`);
    const aClip = `polygon(${a.join(", ")})`;
    if (aClip !== s.lastAttached) {
      attached.style.clipPath = aClip;
      s.lastAttached = aClip;
    }

    // Flap: only the stub above the front — the region a swing could never
    // push into the body, because the body still owns everything below.
    if (f <= 0.001 && s.phase !== "falling" && s.phase !== "gone") {
      if (s.lastFlap !== "hidden") {
        flap.style.opacity = "0";
        s.lastFlap = "hidden";
      }
      return;
    }
    const b: string[] = [`${seamX(0).toFixed(1)}px 0px`, `${s.w}px 0px`];
    b.push(`${s.w}px ${frontY.toFixed(1)}px`);
    b.push(`${seamX(f).toFixed(1)}px ${frontY.toFixed(1)}px`);
    for (let k = kMax; k >= 1; k--) {
      b.push(`${(s.w * live.current.perforationAt + offs[k]).toFixed(1)}px ${((k / n) * s.h).toFixed(1)}px`);
    }
    const bClip = `polygon(${b.join(", ")})`;
    if (bClip !== s.lastFlap) {
      flap.style.clipPath = bClip;
      flap.style.opacity = "1";
      s.lastFlap = bClip;
    }
  };

  const applyFlapTransform = (opacity = 1) => {
    const s = sim.current;
    const flap = flapRef.current;
    if (!flap) return;
    const f = Math.min(Math.max(s.front, 0), 1);
    const originX = seamX(f);
    const originY = f * s.h;
    flap.style.transformOrigin = `${originX}px ${originY}px`;
    if (s.phase === "falling" || s.phase === "gone") {
      flap.style.transform = `translate3d(${s.px.toFixed(1)}px, ${s.py.toFixed(1)}px, 0) rotate(${s.rot.toFixed(2)}deg)`;
      flap.style.opacity = String(Math.max(opacity, 0));
    } else {
      // The peel: the freed part of the stub swings out with progress.
      const swing = f * 13;
      flap.style.transform = `translate3d(${(f * 5).toFixed(1)}px, 0px, 0) rotate(${swing.toFixed(2)}deg)`;
    }
  };

  const measureRef = useRef<((m: Metrics) => void) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: false,
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => {
      const s = sim.current;
      const cfg = live.current;
      if (s.w <= 0) return false;

      if (s.phase === "idle") {
        applyClips();
        return false;
      }

      if (s.phase === "dragging") {
        // Driven directly by the pointer; the frame only repaints.
        applyClips();
        applyFlapTransform();
        return;
      }

      if (s.phase === "springback") {
        if (cfg.reducedMotion) {
          s.front = 0;
          s.frontV = 0;
        } else {
          // Critically-damped-ish return: a failed tear lets go with a snap.
          s.frontV += (-260 * s.front - 22 * s.frontV) * dt;
          s.front += s.frontV * dt;
        }
        if (s.front <= 0.002 && Math.abs(s.frontV) < 0.02) {
          s.front = 0;
          s.frontV = 0;
          s.phase = "idle";
        }
        applyClips();
        applyFlapTransform();
        return;
      }

      if (s.phase === "autotear") {
        s.front = Math.min(1, s.front + dt * 1.6);
        applyClips();
        applyFlapTransform();
        if (s.front >= 1) release(0, 120);
        return;
      }

      if (s.phase === "falling") {
        s.fallT += dt;
        s.vy += 1400 * cfg.gravity * dt;
        s.px += s.vx * dt;
        s.py += s.vy * dt;
        s.rot += s.rotV * dt;
        const fade = Math.min(Math.max((s.fallT - 0.3) / 0.45, 0), 1);
        applyFlapTransform(1 - fade);
        if (fade >= 1 || s.py > s.h * 3) {
          s.phase = "gone";
          s.healLeft = cfg.resetDelay / 1000;
        }
        return;
      }

      // gone: wait out the heal timer, or sleep forever without auto-reset.
      if (!cfg.autoReset) return false;
      s.healLeft -= dt;
      if (s.healLeft <= 0) {
        s.front = 0;
        s.frontV = 0;
        s.px = 0;
        s.py = 0;
        s.rot = 0;
        s.fallT = 0;
        s.phase = "idle";
        const flap = flapRef.current;
        if (flap) {
          flap.style.transform = "";
          flap.style.opacity = "0";
          s.lastFlap = "hidden";
        }
        applyClips();
        return false;
      }
    },
  });

  const release = (vx: number, vy: number) => {
    const s = sim.current;
    const cfg = live.current;
    s.phase = "falling";
    s.fallT = 0;
    s.px = 0;
    s.py = 0;
    s.vx = vx * 0.5;
    s.vy = Math.max(vy * 0.5, 60);
    s.rotV = vx * 0.12 + 40;
    cfg.onTear?.();
    if (cfg.reducedMotion) {
      // No fall for people who asked for stillness — the stub just leaves.
      s.phase = "gone";
      s.healLeft = cfg.resetDelay / 1000;
      const flap = flapRef.current;
      if (flap) {
        flap.style.opacity = "0";
        s.lastFlap = "hidden";
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (s.phase === "falling" || s.phase === "gone" || s.phase === "autotear") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.phase = "dragging";
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
    loop.start();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    const cfg = live.current;
    if (s.phase !== "dragging") return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    // Down and outward both feed the tear; upward pushes it back together.
    s.drive = Math.max(0, dy + Math.max(dx, 0) * 0.5);
    const u = Math.min(s.drive / (s.h * 1.15), 1);
    // The seam fights: progress lags the hand harder the higher the
    // resistance, then gives way all at once near the end.
    s.front = Math.pow(u, 1 + cfg.resistance * 1.6);
    if (cfg.reducedMotion && u >= 0.35) {
      s.front = 1;
      release(0, 80);
      return;
    }
    if (s.front >= 1) {
      const first = s.samples[0];
      const lastS = s.samples[s.samples.length - 1];
      const span = lastS && first ? lastS.t - first.t : 0;
      release(
        span > 8 ? ((lastS.x - first.x) / span) * 1000 : 0,
        span > 8 ? ((lastS.y - first.y) / span) * 1000 : 0,
      );
      return;
    }
    s.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (s.samples.length > 4) s.samples.shift();
    loop.start();
  };

  const onPointerUp = () => {
    const s = sim.current;
    if (s.phase !== "dragging") return;
    s.phase = s.front > 0 ? "springback" : "idle";
    s.drive = 0;
    loop.start();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (s.phase !== "idle") return;
    if (live.current.reducedMotion) {
      s.front = 1;
      release(0, 80);
    } else {
      s.phase = "autotear";
    }
    loop.start();
  };

  useEffect(() => {
    measureRef.current = () => {
      const ticket = ticketRef.current;
      if (!ticket) return;
      const rect = ticket.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = sim.current;
      s.w = rect.width;
      s.h = rect.height;
      s.lastAttached = "";
      s.lastFlap = "";
      applyClips();
      applyFlapTransform();
    };
    loop.resize();
    return () => {
      measureRef.current = null;
    };
    // Geometry helpers read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop]);

  // A new edge or seam position re-cuts the clips even while idle.
  useEffect(() => {
    const s = sim.current;
    s.lastAttached = "";
    s.lastFlap = "";
    loop.paint();
  }, [jagOffsets, perforationAt, loop]);

  // Flipping auto-reset back on wakes a ticket sleeping in the gone state.
  useEffect(() => {
    loop.start();
  }, [autoReset, loop]);

  return (
    <div
      ref={containerRef}
      // touch-none because the drag IS the component — without it a finger
      // tearing the stub scrolls the page. select-none because the printed
      // ticket text sits directly under that drag: selected text turns the
      // next press into native drag-and-drop, the browser fires
      // pointercancel, and the stub freezes mid-tear.
      className={`flex h-full w-full touch-none items-center justify-center select-none ${className}`.trim()}
    >
      <div ref={ticketRef} className="relative aspect-[2.15/1] w-[min(86%,360px)]">
        {/* Everything still attached. */}
        <div
          ref={attachedRef}
          className="absolute inset-0 rounded-lg border border-[#33333e] bg-[#17151d] shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
        >
          <TicketFace ink={inkColor} at={perforationAt} />
        </div>
        {/* The freed part of the stub — same ticket, complementary cut. */}
        <div
          ref={flapRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg border border-[#33333e] bg-[#17151d] opacity-0 will-change-transform"
        >
          <TicketFace ink={inkColor} at={perforationAt} />
        </div>
        {/* The grab surface: the stub side of the seam. */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Tear off the ticket stub"
          className="absolute inset-y-0 right-0 cursor-grab rounded-r-lg outline-none focus-visible:ring-2 focus-visible:ring-amethyst active:cursor-grabbing"
          style={{ left: `${perforationAt * 100}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
};

export default Tear;
