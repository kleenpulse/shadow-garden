"use client";

import { memo, useMemo } from "react";

// Generated identity marks. A template ships no third-party logos (SPEC §C15) and
// no binaries at all (§C12), so every mark in the partner marquee and the
// portfolio grid is constructed here from the name itself.
//
// Deterministic, not random: the same name always draws the same mark, so the
// grid is stable across renders, across reloads and across a buyer's build. That
// is what makes it usable as a real placeholder rather than noise — and swapping
// in real artwork later is one component to replace, in one place.

/** FNV-1a. Small, stable, and does not vary between engines the way a hand-rolled shift-hash can. */
function hash(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Six constructions, each drawn inside a 0–100 box so the plate can scale freely. */
function geometry(seed: number, stroke: string): string {
  const shape = seed % 6;
  const a = 20 + ((seed >> 3) % 12);

  switch (shape) {
    // Concentric arcs — a signal or a horizon, depending on the rotation.
    case 0:
      return `<circle cx="50" cy="50" r="${34 - a / 4}" fill="none" stroke="${stroke}" stroke-width="7"/>
              <circle cx="50" cy="50" r="${16 - a / 8}" fill="${stroke}"/>`;
    // Stacked bars, weighted by the seed.
    case 1:
      return `<rect x="22" y="26" width="56" height="10" fill="${stroke}"/>
              <rect x="22" y="45" width="${28 + a}" height="10" fill="${stroke}"/>
              <rect x="22" y="64" width="40" height="10" fill="${stroke}"/>`;
    // A folded chevron.
    case 2:
      return `<path d="M24 72 L50 26 L76 72" fill="none" stroke="${stroke}" stroke-width="9" stroke-linejoin="miter"/>`;
    // Quartered square with one cell knocked out.
    case 3:
      return `<rect x="24" y="24" width="24" height="24" fill="${stroke}"/>
              <rect x="52" y="24" width="24" height="24" fill="${stroke}" opacity="0.45"/>
              <rect x="24" y="52" width="24" height="24" fill="${stroke}" opacity="0.45"/>
              <rect x="52" y="52" width="24" height="24" fill="${stroke}"/>`;
    // Half-disc over a rule.
    case 4:
      return `<path d="M24 58 A26 26 0 0 1 76 58 Z" fill="${stroke}"/>
              <rect x="24" y="66" width="52" height="8" fill="${stroke}" opacity="0.5"/>`;
    // Diamond outline with an inner solid.
    default:
      return `<path d="M50 20 L80 50 L50 80 L20 50 Z" fill="none" stroke="${stroke}" stroke-width="7"/>
              <path d="M50 38 L62 50 L50 62 L38 50 Z" fill="${stroke}"/>`;
  }
}

function svgMarkup(name: string, color: string, background: string | null): string {
  const seed = hash(name);
  const plate = background
    ? `<rect width="100" height="100" fill="${background}"/>`
    : "";
  const rotation = (seed >> 9) % 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${plate}<g transform="rotate(${rotation * 90} 50 50)">${geometry(seed, color)}</g></svg>`;
}

function BrandMarkImpl({
  name,
  className,
  color = "currentColor",
  background = null,
}: {
  name: string;
  className?: string;
  /** Any CSS colour. Defaults to the inherited text colour. */
  color?: string;
  /** Plate behind the mark. `null` leaves it transparent. */
  background?: string | null;
}) {
  // Building the markup is cheap; parsing it is not. `dangerouslySetInnerHTML`
  // makes React diff a string and hand the browser an HTML parse whenever that
  // string changes, and this page mounts well over a hundred marks. Without the
  // memo, dragging the accent control re-parses every one of them on every tick.
  const html = useMemo(
    () => svgMarkup(name, color, background),
    [name, color, background],
  );

  return (
    <span
      className={className}
      role="img"
      aria-label={name}
      // Generated markup, not user content: the only interpolated values are a
      // hashed shape index and two colours the template controls.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Memoised at the component boundary as well as inside it. The marks are pure
 * functions of their props and they render in long lists, so a parent re-render —
 * a theme toggle, a tuned token, a section entering view — should not touch them
 * at all.
 */
export const BrandMark = memo(BrandMarkImpl);

/**
 * The same mark as a data URI, for the one consumer that needs pixels rather than
 * DOM — the ASCII plate rasterises it to a canvas.
 */
export function brandMarkDataUri(
  name: string,
  color = "#8b8b8b",
  background: string | null = null,
): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup(name, color, background))}`;
}
