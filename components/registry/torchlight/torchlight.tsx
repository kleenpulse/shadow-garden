"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The root sets `touch-action: none` so sweeping a finger moves the torch instead
// of scrolling the page, and `user-select: none` so a slow sweep across body copy
// doesn't raise the iOS selection callout. Touch behaviour is the intersection of
// every ancestor up to the nearest scroller, so a child cannot re-enable panning:
// don't nest a scrollable region inside Torchlight.
export interface TorchlightProps {
  children?: ReactNode;
  className?: string;
  /** Radius (px) of the fully-revealed torch circle. */
  radius?: number;
  /** Feather of the reveal edge, 0 (hard) → 1 (very soft). */
  softness?: number;
  /** Opacity of the void overlay outside the torch, 0.5 → 1. */
  darkness?: number;
  /** Ambient reveal floor — how much of the scene stays visible in the dark, 0 → 0.3. */
  restReveal?: number;
  /** How much the light lags the cursor, 0.02 (snappy) → 1 (slow drift). */
  smoothing?: number;
  /** Candle flicker intensity, 0 (steady) → 1 (guttering). */
  flicker?: number;
  /** Warm tint of the torch glow (hex). */
  torchColor?: string;
  /** When true, the flicker animation is suppressed. */
  reducedMotion?: boolean;
}

// Global one-time CSS: registers the animatable torch-position custom properties
// (so a transition can lag them behind the cursor) and the flicker keyframes.
// @property + @keyframes are idempotent, so re-declaring per instance is harmless.
const TORCH_CSS = `
@property --torch-x { syntax: "<length>"; inherits: true; initial-value: -9999px; }
@property --torch-y { syntax: "<length>"; inherits: true; initial-value: -9999px; }
@keyframes sg-torch-flicker {
  0%, 100% { opacity: calc(0.4 - var(--sg-flick, 0) * 0.03); transform: scale(1); }
  18%  { opacity: calc(0.4 - var(--sg-flick, 0) * 0.16); transform: scale(calc(1 - var(--sg-flick, 0) * 0.035)); }
  37%  { opacity: 0.4;                                     transform: scale(calc(1 + var(--sg-flick, 0) * 0.025)); }
  55%  { opacity: calc(0.4 - var(--sg-flick, 0) * 0.07); transform: scale(1); }
  72%  { opacity: calc(0.4 - var(--sg-flick, 0) * 0.2);  transform: scale(calc(1 - var(--sg-flick, 0) * 0.02)); }
  88%  { opacity: calc(0.4 - var(--sg-flick, 0) * 0.05); transform: scale(calc(1 + var(--sg-flick, 0) * 0.015)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-sg-torch-glow] { animation: none !important; }
}
`;

export default function Torchlight({
  children,
  className,
  radius = 140,
  softness = 0.5,
  darkness = 0.92,
  restReveal = 0,
  smoothing = 0.15,
  flicker = 0.15,
  torchColor = "#a855f7",
  reducedMotion = false,
}: TorchlightProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const moveTo = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--torch-x", `${clientX - rect.left}px`);
    el.style.setProperty("--torch-y", `${clientY - rect.top}px`);
  }, []);

  const park = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--torch-x", "-9999px");
    el.style.setProperty("--torch-y", "-9999px");
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => moveTo(e.clientX, e.clientY),
    [moveTo]
  );
  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      if (t) moveTo(t.clientX, t.clientY);
    },
    [moveTo]
  );

  // Reveal geometry — rebuilt on every render (cheap; the pointer never re-renders).
  const soft = Math.min(Math.max(softness, 0), 1);
  const inner = Math.max(radius * (1 - soft), 0);
  const outer = radius * (1 + soft) + 1;
  const overlayOpacity =
    Math.min(Math.max(darkness, 0), 1) * (1 - Math.min(Math.max(restReveal, 0), 1));
  const lagSeconds = (0.03 + Math.min(Math.max(smoothing, 0.02), 1) * 0.57).toFixed(3);
  const flickAmt = Math.min(Math.max(flicker, 0), 1);
  const glowActive = !reducedMotion && flickAmt > 0;

  const revealMask = `radial-gradient(circle at var(--torch-x) var(--torch-y), transparent ${inner}px, #000 ${outer}px)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerLeave={park}
      onTouchMove={onTouchMove}
      onTouchEnd={park}
      onTouchCancel={park}
      className={cn(
        "relative isolate touch-none select-none overflow-hidden",
        className,
      )}
      style={
        {
          "--torch-x": "-9999px",
          "--torch-y": "-9999px",
          transition: `--torch-x ${lagSeconds}s cubic-bezier(0.22, 1, 0.36, 1), --torch-y ${lagSeconds}s cubic-bezier(0.22, 1, 0.36, 1)`,
        } as React.CSSProperties
      }
    >
      <style>{TORCH_CSS}</style>

      {/* Scene to be uncovered. */}
      <div className="relative z-0">{children}</div>

      {/* Void overlay — near-black everywhere the torch is not. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: "rgb(5 5 8)",
          opacity: overlayOpacity,
          maskImage: revealMask,
          WebkitMaskImage: revealMask,
        }}
      />

      {/* Additive warm glow, tinted by torchColor and gently flickering. */}
      <div
        aria-hidden
        data-sg-torch-glow
        className="pointer-events-none absolute inset-0 z-20"
        style={
          {
            background: `radial-gradient(circle at var(--torch-x) var(--torch-y), ${torchColor} 0px, transparent ${(radius * 1.15).toFixed(0)}px)`,
            mixBlendMode: "plus-lighter",
            transformOrigin: "var(--torch-x) var(--torch-y)",
            opacity: 0.4,
            "--sg-flick": flickAmt,
            animation: glowActive
              ? "sg-torch-flicker 140ms steps(2, end) infinite"
              : "none",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
