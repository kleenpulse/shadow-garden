"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Progressive edge blur. A short stack of backdrop-filter layers, each masked by
// a gradient so the blur ramps from clear to full toward one edge — the sum reads
// as a single smooth dissolve. Purely decorative (aria-hidden) and static by
// default; opt into a fade with `animated`. No runtime <style> injection, no
// preset/responsive machinery — just the layers and a few knobs.

type Position = "top" | "bottom" | "left" | "right";
type Curve = "linear" | "bezier" | "ease-in" | "ease-out" | "ease-in-out";
type Target = "parent" | "page";

export interface MaskBlurProps {
  position?: Position;
  strength?: number;
  height?: string;
  width?: string;
  divCount?: number;
  exponential?: boolean;
  curve?: Curve;
  opacity?: number;
  target?: Target;
  /** Wash the blurred edge with a faint, theme-aware amethyst accent. */
  tinted?: boolean;
  /** false = static (default) · true = fade in on mount · "scroll" = reveal in view. */
  animated?: boolean | "scroll";
  duration?: string;
  easing?: string;
  hoverIntensity?: number;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

// Per-step blur quantum: 0.0625rem == 1px at a 16px root.
const BASE_BLUR_REM = 0.0625;

const CURVES: Record<Curve, (p: number) => number> = {
  linear: (p) => p,
  bezier: (p) => p * p * (3 - 2 * p), // smoothstep
  "ease-in": (p) => p * p,
  "ease-out": (p) => 1 - (1 - p) ** 2,
  "ease-in-out": (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
};

const GRADIENT_TO: Record<Position, string> = {
  top: "to top",
  bottom: "to bottom",
  left: "to left",
  right: "to right",
};

const round1 = (n: number) => Math.round(n * 10) / 10;

// Blur radius (rem) for layer `i` of `count`, after the curve + strength scaling.
function layerBlur(
  i: number,
  count: number,
  curve: Curve,
  exponential: boolean,
  strength: number,
): number {
  const t = CURVES[curve](i / count);
  const ramp = exponential ? 2 ** (t * 4) : t * count + 1;
  return BASE_BLUR_REM * ramp * strength;
}

// Four-stop mask isolating this layer's slice of the edge; stacking every layer's
// slice yields one continuous clear→blurred ramp.
function layerMask(i: number, count: number, to: string): string {
  const span = 100 / count;
  const a = round1(span * (i - 1));
  const b = round1(span * i);
  const c = round1(span * (i + 1));
  const d = round1(span * (i + 2));
  let stops = `transparent ${a}%, black ${b}%`;
  if (c <= 100) stops += `, black ${c}%`;
  if (d <= 100) stops += `, transparent ${d}%`;
  return `linear-gradient(${to}, ${stops})`;
}

// Explicit per-position offsets (no dynamic key indexing → clean under strict TS).
function edgeStyle(
  position: Position,
  vertical: boolean,
  height: string,
  width: string | undefined,
): CSSProperties {
  const size: CSSProperties = vertical
    ? { height, width: width ?? "100%" }
    : { width: width ?? height, height: "100%" };
  switch (position) {
    case "top":
      return { ...size, top: 0, left: 0, right: 0 };
    case "bottom":
      return { ...size, bottom: 0, left: 0, right: 0 };
    case "left":
      return { ...size, left: 0, top: 0, bottom: 0 };
    case "right":
      return { ...size, right: 0, top: 0, bottom: 0 };
  }
}

export default function MaskBlur({
  position = "bottom",
  strength = 1,
  height = "6rem",
  width,
  divCount = 5,
  exponential = true,
  curve = "bezier",
  opacity = 1,
  target = "parent",
  tinted = false,
  animated = false,
  duration = "0.3s",
  easing = "ease-out",
  hoverIntensity,
  zIndex = 10,
  className,
  style,
  children,
}: MaskBlurProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (animated === false) return;
    if (animated === "scroll") {
      const el = ref.current;
      if (!el) return;
      const io = new IntersectionObserver(
        ([entry]) => setRevealed(entry.isIntersecting),
        { threshold: 0.1 },
      );
      io.observe(el);
      return () => io.disconnect();
    }
    // animated === true: reveal on mount (opacity transition carries it in).
    setRevealed(true);
  }, [animated]);

  const vertical = position === "top" || position === "bottom";
  const to = GRADIENT_TO[position];
  const activeStrength =
    hovered && hoverIntensity ? strength * hoverIntensity : strength;

  const layers = useMemo(() => {
    const willTransition = animated !== false && !reduce;
    const styles: CSSProperties[] = [];
    for (let i = 1; i <= divCount; i++) {
      const blur = layerBlur(i, divCount, curve, exponential, activeStrength);
      const mask = layerMask(i, divCount, to);
      styles.push({
        position: "absolute",
        inset: 0,
        maskImage: mask,
        WebkitMaskImage: mask,
        backdropFilter: `blur(${blur.toFixed(3)}rem)`,
        WebkitBackdropFilter: `blur(${blur.toFixed(3)}rem)`,
        opacity,
        ...(tinted
          ? {
              backgroundImage: `linear-gradient(${to}, transparent, color-mix(in oklab, var(--color-accent) 12%, transparent))`,
            }
          : null),
        ...(willTransition
          ? { transition: `backdrop-filter ${duration} ${easing}` }
          : null),
      });
    }
    return styles;
  }, [
    divCount,
    curve,
    exponential,
    activeStrength,
    to,
    opacity,
    tinted,
    animated,
    reduce,
    duration,
    easing,
  ]);

  const isPage = target === "page";
  const shown = animated === false || reduce ? true : revealed;

  const containerStyle: CSSProperties = {
    position: isPage ? "fixed" : "absolute",
    pointerEvents: hoverIntensity ? "auto" : "none",
    opacity: shown ? 1 : 0,
    transition: animated && !reduce ? `opacity ${duration} ${easing}` : undefined,
    zIndex: isPage ? zIndex + 100 : zIndex,
    ...edgeStyle(position, vertical, height, width),
    ...style,
  };

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(className)}
      style={containerStyle}
      onMouseEnter={hoverIntensity ? () => setHovered(true) : undefined}
      onMouseLeave={hoverIntensity ? () => setHovered(false) : undefined}
    >
      {layers.map((layerStyle, i) => (
        <div key={i} style={layerStyle} />
      ))}
      {children}
    </div>
  );
}
