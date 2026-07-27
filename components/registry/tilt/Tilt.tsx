"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A card that leans toward the pointer in 3D, with a specular sheet that slides
// across its face as it turns. Two nested enclosures — an outer tray and an inner
// plate with concentric radii — so it reads as machined hardware rather than a div.
//
// No rAF anywhere: the pointer writes CSS custom properties and CSS transitions do
// the smoothing, which keeps the whole effect on the compositor.
//
// Deliberately *not* touch-driven. A finger dragging across a card should scroll
// the page, so touch pointers are ignored and no `touch-action` is set here.
export interface TiltProps {
  children?: ReactNode;
  className?: string;
  /** Maximum lean at the card's edge, in degrees. */
  maxTilt?: number;
  /** Depth of the 3D projection — lower exaggerates the perspective. */
  perspective?: number;
  /** Opacity of the specular sheet, 0 (matte) → 1 (mirror). */
  glare?: number;
  /** Glare radius as a fraction of the card's width. */
  glareSize?: number;
  /** Scale applied while the pointer is over the card. */
  hoverScale?: number;
  /** Seconds the card takes to catch up to the pointer. */
  smoothing?: number;
  /** Tint of the specular sheet (hex). */
  glareColor?: string;
  /** When true, the card stays flat and the glare is suppressed. */
  reducedMotion?: boolean;
}

// Registering the glare coordinates makes them interpolatable, so the sheet lags
// the pointer on the same curve the card does instead of snapping. @property is
// idempotent, so re-declaring it per instance is harmless.
const TILT_CSS = `
@property --sg-tilt-gx { syntax: "<length>"; inherits: true; initial-value: 50%; }
@property --sg-tilt-gy { syntax: "<length>"; inherits: true; initial-value: 50%; }
`;

// Asymmetric — leaves the pointer quickly, settles back slowly. A symmetric curve
// here reads as mechanical.
const TILT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function Tilt({
  children,
  className,
  maxTilt = 10,
  perspective = 900,
  glare = 0.35,
  glareSize = 0.9,
  hoverScale = 1.03,
  smoothing = 0.28,
  glareColor = "#c4b5fd",
  reducedMotion = false,
}: TiltProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const apply = useCallback(
    (clientX: number, clientY: number, active: boolean) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // -0.5 → 0.5 from the card's centre.
      const nx = (clientX - rect.left) / rect.width - 0.5;
      const ny = (clientY - rect.top) / rect.height - 0.5;
      // Y drives rotateX inverted: pointer above centre should tip the top away.
      el.style.setProperty("--sg-tilt-rx", `${(-ny * 2 * maxTilt).toFixed(3)}deg`);
      el.style.setProperty("--sg-tilt-ry", `${(nx * 2 * maxTilt).toFixed(3)}deg`);
      el.style.setProperty("--sg-tilt-gx", `${((nx + 0.5) * 100).toFixed(2)}%`);
      el.style.setProperty("--sg-tilt-gy", `${((ny + 0.5) * 100).toFixed(2)}%`);
      el.style.setProperty("--sg-tilt-scale", active ? `${hoverScale}` : "1");
      el.style.setProperty("--sg-tilt-glare", active ? `${glare}` : "0");
    },
    [maxTilt, hoverScale, glare],
  );

  const rest = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--sg-tilt-rx", "0deg");
    el.style.setProperty("--sg-tilt-ry", "0deg");
    el.style.setProperty("--sg-tilt-gx", "50%");
    el.style.setProperty("--sg-tilt-gy", "50%");
    el.style.setProperty("--sg-tilt-scale", "1");
    el.style.setProperty("--sg-tilt-glare", "0");
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Touch scrolls the page; only a hovering device tilts the card.
      if (reducedMotion || e.pointerType === "touch") return;
      apply(e.clientX, e.clientY, true);
    },
    [apply, reducedMotion],
  );

  const lag = Math.min(Math.max(smoothing, 0.05), 1).toFixed(3);

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerLeave={rest}
      onPointerCancel={rest}
      className={cn("[transform-style:preserve-3d]", className)}
      style={
        {
          perspective: `${perspective}px`,
          "--sg-tilt-rx": "0deg",
          "--sg-tilt-ry": "0deg",
          "--sg-tilt-scale": "1",
          "--sg-tilt-glare": "0",
          transition: `--sg-tilt-gx ${lag}s ${TILT_EASE}, --sg-tilt-gy ${lag}s ${TILT_EASE}`,
        } as React.CSSProperties
      }
    >
      <style>{TILT_CSS}</style>

      {/* Outer tray — the bezel the plate sits in. */}
      <div
        className="h-full rounded-[2rem] border border-hairline bg-raised/50 p-1.5 will-change-transform"
        style={{
          transform:
            "rotateX(var(--sg-tilt-rx)) rotateY(var(--sg-tilt-ry)) scale(var(--sg-tilt-scale))",
          transformStyle: "preserve-3d",
          transition: `transform ${lag}s ${TILT_EASE}`,
        }}
      >
        {/* Inner plate — radius is the tray's minus its padding, so the curves
            stay concentric instead of drifting apart at the corners. */}
        <div
          className="relative h-full overflow-hidden rounded-[calc(2rem-0.375rem)] bg-panel"
          style={{ boxShadow: "inset 0 1px 1px rgb(255 255 255 / 0.09)" }}
        >
          {children}

          {/* Specular sheet. plus-lighter keeps it additive so it reads as light
              landing on the surface rather than a white shape painted over it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle ${Math.round(glareSize * 100)}% at var(--sg-tilt-gx) var(--sg-tilt-gy), ${glareColor}, transparent 70%)`,
              mixBlendMode: "plus-lighter",
              opacity: "var(--sg-tilt-glare)",
              transition: `opacity ${lag}s ${TILT_EASE}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
