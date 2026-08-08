"use client";

import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Chrome, painted onto real text. A vertical metal ramp fills the glyphs, a
// narrow specular travels across them, and a wider accent-tinted wake follows it
// a beat later — the lag is the whole difference between "a gradient is sliding"
// and "light is moving over metal".
//
// The text stays ONE text node: selectable, searchable, and read by a screen
// reader exactly once. Every Text Animations entry honours that, and the
// collection page promises it in prose no check can verify.
//
// Two nested elements, not two copies of the string. A single element carries
// only one `animation-delay`, so the wake could never trail the core from the
// same box. The outer span owns the ramp and the wake, the inner owns the
// specular, and `background-clip: text` on an ancestor clips to every glyph
// inside it — so both layers reach the same letters while only the inner holds
// the text node.
//
// Outer is inline-block and inner is block, so each gets ONE background box. An
// inline inner would fragment per line and restart the sweep on every wrapped
// row.
//
// No @property, no registered custom idents, no JS feature detect: the lag comes
// from two elements rather than two animated custom properties, so what animates
// is plain `background-position` and there is nothing to degrade. The one real
// support question is `background-clip: text` itself, and that is answered
// declaratively — outside the @supports block the element is ordinary coloured
// text. A transparent glyph with no fallback is a blank headline, not a degraded
// one.
export interface MetallicTextProps {
  /** The line to render as metal. */
  text?: string;
  /** Seconds for one pass of the highlight. */
  sweepSpeed?: number;
  /** Width of the specular band, as a share of the text box. */
  sweepWidth?: number;
  /** Rake of the band, in degrees off vertical. */
  sweepAngle?: number;
  /** Separation between the dark and light bands of the metal ramp. */
  contrast?: number;
  /** Brightness of the travelling highlight. */
  specular?: number;
  /** How far the wake trails the highlight, as a share of one pass. */
  lag?: number;
  /** Whether the light returns the way it came or restarts from the edge. */
  sweep?: "alternate" | "loop";
  /** Brushed striations along the sweep axis. */
  grain?: number;
  /** The metal, and the fallback colour where background-clip is unsupported. */
  baseColor?: string;
  /** The specular. */
  highlightColor?: string;
  /** Tint of the wake. */
  accentColor?: string;
  /** Halts the sweep where it stands. */
  paused?: boolean;
  /** Withholds the sweep and parks the highlight; the metal stays. */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * Static by design: every tunable is a custom property on the element, so
 * dragging a control writes a variable instead of replacing the stylesheet. A
 * sheet rebuilt per render reparses and re-rasterises the text on every frame of
 * a slider drag.
 */
function sheet(ns: string): string {
  return `
.${ns} {
  display: inline-block;
  color: var(--mt-base);
}

.${ns} > .${ns}-core {
  display: block;
  color: inherit;
}

@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  .${ns},
  .${ns} > .${ns}-core {
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    animation-duration: var(--mt-dur);
    animation-iteration-count: infinite;
    animation-direction: var(--mt-dir);
    animation-play-state: var(--mt-play);
  }

  .${ns} {
    background-image:
      linear-gradient(
        var(--mt-angle),
        transparent 0 var(--mt-w0),
        color-mix(in srgb, var(--mt-accent) var(--mt-halo), transparent) 50%,
        transparent var(--mt-w2) 100%
      ),
      repeating-linear-gradient(
        var(--mt-angle),
        rgb(255 255 255 / var(--mt-grain)) 0 1px,
        rgb(0 0 0 / var(--mt-grain)) 1px 2px,
        transparent 2px 4px
      ),
      linear-gradient(
        180deg,
        color-mix(in oklab, var(--mt-base) var(--mt-dark), black) 0%,
        color-mix(in oklab, var(--mt-base) var(--mt-lite), var(--mt-hi)) 26%,
        var(--mt-base) 44%,
        color-mix(in oklab, var(--mt-base) var(--mt-dark), black) 56%,
        color-mix(in oklab, var(--mt-base) var(--mt-lite), var(--mt-hi)) 80%,
        color-mix(in oklab, var(--mt-base) 88%, black) 100%
      );
    background-size: 300% 300%, auto, 100% 100%;
    background-position: var(--mt-park) 50%, 0 0, 0 0;
    background-repeat: no-repeat, repeat, no-repeat;
    background-blend-mode: screen, overlay, normal;
    animation-name: ${ns}-wake;
    animation-timing-function: var(--mt-ease-wake);
    animation-delay: var(--mt-delay);
    animation-fill-mode: backwards;
  }

  .${ns} > .${ns}-core {
    background-image: linear-gradient(
      var(--mt-angle),
      transparent 0 var(--mt-s0),
      color-mix(in srgb, var(--mt-hi) var(--mt-spec), transparent) 50%,
      transparent var(--mt-s2) 100%
    );
    background-size: 300% 300%;
    background-position: var(--mt-park) 50%;
    background-repeat: no-repeat;
    animation-name: ${ns}-core;
    animation-timing-function: var(--mt-ease-core);
  }
}

.${ns}.${ns}-still,
.${ns}.${ns}-still > .${ns}-core {
  animation-name: none;
}

@keyframes ${ns}-core {
  from { background-position: 100% 50%; }
  to { background-position: 0% 50%; }
}

@keyframes ${ns}-wake {
  from { background-position: 100% 50%, 0 0, 0 0; }
  to { background-position: 0% 50%, 0 0, 0 0; }
}
`;
}

/** Where the highlight parks when the sweep is withheld — on the text, not off it. */
const PARK = "62%";

export default function MetallicText({
  text = "METALLIC",
  sweepSpeed = 3.2,
  sweepWidth = 0.28,
  sweepAngle = 18,
  contrast = 0.7,
  specular = 0.85,
  lag = 0.35,
  sweep = "alternate",
  grain = 0.12,
  baseColor = "#8f94a3",
  highlightColor = "#ffffff",
  accentColor = "#a855f7",
  paused = false,
  reducedMotion = false,
  className,
}: MetallicTextProps) {
  // useId is not a valid custom-ident — React wraps it in guillemets — so the
  // non-alphanumerics come out before it reaches a class name or a @keyframes.
  const ns = `sg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // The band is measured against the text box but drawn into a tile three times
  // its width, so a share of the box is a third of that share of the tile.
  const half = (Math.max(0.02, sweepWidth) * 100) / 6;
  const wakeHalf = Math.min(26, half * 2.6);

  return (
    <>
      <style>{sheet(ns)}</style>
      <span
        className={cn(ns, reducedMotion && `${ns}-still`, className)}
        style={
          {
            "--mt-base": baseColor,
            "--mt-hi": highlightColor,
            "--mt-accent": accentColor,
            // CSS measures a gradient angle from "to top", and a sweepAngle of
            // zero should mean an upright band travelling sideways.
            "--mt-angle": `${90 + sweepAngle}deg`,
            "--mt-dur": `${sweepSpeed}s`,
            "--mt-delay": `${(lag * 0.3 * sweepSpeed).toFixed(3)}s`,
            "--mt-dir": sweep === "alternate" ? "alternate" : "normal",
            "--mt-play": paused ? "paused" : "running",
            "--mt-park": PARK,
            "--mt-grain": `${grain}`,
            "--mt-dark": `${Math.max(20, 100 - contrast * 45).toFixed(1)}%`,
            "--mt-lite": `${Math.max(15, 100 - contrast * 55).toFixed(1)}%`,
            "--mt-spec": `${Math.round(Math.min(1, specular) * 100)}%`,
            "--mt-halo": `${Math.round(Math.min(0.6, specular * 0.4) * 100)}%`,
            "--mt-s0": `${(50 - half).toFixed(2)}%`,
            "--mt-s2": `${(50 + half).toFixed(2)}%`,
            "--mt-w0": `${(50 - wakeHalf).toFixed(2)}%`,
            "--mt-w2": `${(50 + wakeHalf).toFixed(2)}%`,
            "--mt-ease-core": "cubic-bezier(0.45, 0, 0.55, 1)",
            // Overshoots on purpose. A trailing mass keeps going the old way
            // through a direction change before it catches up, which is what
            // follow-through IS — under alternate the wake leads for a beat
            // either side of the turn, and that is the effect, not a defect.
            "--mt-ease-wake": "cubic-bezier(0.34, 1.56, 0.64, 1)",
          } as CSSProperties
        }
      >
        <span className={`${ns}-core`}>{text}</span>
      </span>
    </>
  );
}
