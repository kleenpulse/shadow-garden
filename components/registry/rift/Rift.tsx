"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A tear between two overlaid scenes. Drag the divider and the top layer's
// clip-path follows; push past either edge and it resists, then snaps back.
//
// Drag-driven, so `touch-none` is set inline on the root — without it a finger
// drag scrolls the page instead of moving the divider. Pointer events only:
// a touch drag emits no mouse events, so a mousemove binding would be dead on a
// phone.
//
// The handle is a real slider: focus it and the arrow keys move the tear.
export interface RiftProps {
  /** Layer on the left of the tear. */
  before?: ReactNode;
  /** Layer on the right of the tear. */
  after?: ReactNode;
  className?: string;
  /** Resting position of the tear, 0 → 100. */
  position?: number;
  /** Thickness of the divider line, in px. */
  handleWidth?: number;
  /** Give when dragged past an edge, 0 (hard stop) → 1 (loose). */
  rubberBand?: number;
  /** Lean of the tear off vertical, in degrees. */
  angle?: number;
  /** Return to the resting position on release instead of staying put. */
  snapBack?: boolean;
  /** Bloom along the divider, 0 → 1. */
  glow?: number;
  /** Divider colour (hex). */
  accentColor?: string;
  /** When true, the snap-back is instant rather than eased. */
  reducedMotion?: boolean;
}

const RIFT_CSS = `
@property --sg-rift-pos { syntax: "<number>"; inherits: true; initial-value: 50; }
`;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Map a raw drag position to a displayed one. Inside the track it is the identity;
 * past an edge, tanh eases the overshoot toward an asymptote, so the divider gives
 * a little and then refuses — the iOS overscroll feel. rubberBand 0 hard-clamps.
 */
function resist(raw: number, rubberBand: number): number {
  if (raw >= 0 && raw <= 100) return raw;
  const edge = raw < 0 ? 0 : 100;
  const over = raw - edge;
  const give = 18 * rubberBand;
  if (give <= 0) return edge;
  return edge + give * Math.tanh(over / give);
}

export default function Rift({
  before,
  after,
  className,
  position = 50,
  handleWidth = 2,
  rubberBand = 0.35,
  angle = 0,
  snapBack = false,
  glow = 0.4,
  accentColor = "#a855f7",
  reducedMotion = false,
}: RiftProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(position);
  const [dragging, setDragging] = useState(false);

  const fromClientX = useCallback((clientX: number) => {
    const el = rootRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const raw = fromClientX(e.clientX);
      if (raw === null) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      setPos(resist(raw, rubberBand));
    },
    [fromClientX, rubberBand],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const raw = fromClientX(e.clientX);
      if (raw === null) return;
      setPos(resist(raw, rubberBand));
    },
    [dragging, fromClientX, rubberBand],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);
      // Always settle back inside the track; snapBack goes all the way home.
      setPos((p) => (snapBack ? position : Math.min(100, Math.max(0, p))));
    },
    [dragging, snapBack, position],
  );

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => Math.max(0, p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => Math.min(100, p + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPos(100);
    }
  }, []);

  // Lean expressed as a share of width rather than a true angle — it needs no
  // aspect-ratio measurement and is indistinguishable at these magnitudes.
  const lean = angle * 0.4;
  const clip = `polygon(0% 0%, calc((var(--sg-rift-pos) + ${lean}) * 1%) 0%, calc((var(--sg-rift-pos) - ${lean}) * 1%) 100%, 0% 100%)`;

  // While dragging, the divider must track the finger exactly — easing it here
  // would read as lag, not smoothing. The transition is only for the release.
  const settle =
    dragging || reducedMotion
      ? "none"
      : `--sg-rift-pos 420ms ${EASE}`;

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "relative isolate touch-none select-none overflow-hidden",
        dragging ? "cursor-grabbing" : "cursor-ew-resize",
        className,
      )}
      style={
        {
          "--sg-rift-pos": pos,
          transition: settle,
        } as React.CSSProperties
      }
    >
      <style>{RIFT_CSS}</style>

      {/* Right-hand scene, full bleed underneath. */}
      <div className="absolute inset-0 z-0">{after}</div>

      {/* Left-hand scene, clipped to the tear. */}
      <div
        className="absolute inset-0 z-10"
        style={{ clipPath: clip, WebkitClipPath: clip }}
      >
        {before}
      </div>

      {/* The divider itself. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Reveal position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, Math.max(0, pos)))}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 z-20 outline-none"
        style={{
          left: "calc(var(--sg-rift-pos) * 1%)",
          width: `${Math.max(handleWidth, 2)}px`,
          transform: `translateX(-50%) rotate(${angle}deg)`,
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: accentColor,
            boxShadow:
              glow > 0
                ? `0 0 ${(glow * 24).toFixed(0)}px ${(glow * 4).toFixed(0)}px ${accentColor}`
                : undefined,
            opacity: 0.9,
          }}
        />
        {/* Grip — the only part that needs a hit target bigger than a hairline. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-panel/90 font-display text-[11px] text-ink backdrop-blur"
        >
          ⇄
        </span>
        {/* Focus ring rides a sibling so it isn't clipped by the 2px divider. */}
        <span className="pointer-events-none absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full ring-accent transition-shadow group-focus-visible:ring-2" />
      </div>
    </div>
  );
}
