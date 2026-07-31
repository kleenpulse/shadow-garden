"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { cn } from "@/lib/utils";

// A Solari board. Each column walks the charset one flap at a time until it
// reaches its letter, so the word does not appear — it is arrived at.
//
// THE TWO-LEAF TRICK. A card is one glyph seen through two windows: a top half
// and a bottom half, each `overflow-hidden`, with the bottom copy shifted up by
// its own height. A flip from `cur` to `next` runs four surfaces:
//
//   static top     next  — uncovered as leaf A falls away
//   static bottom  cur   — covered as leaf B rises into place
//   leaf A         cur, top half,    origin bottom, rotateX  0 → -90
//   leaf B         next, bottom half, origin top,   rotateX 90 →  0
//
// Neither leaf is ever seen from behind, so there is no `backface-visibility`,
// no mirrored glyph, and no cull-order to get wrong. The leaves live in
// different halves and never overlap, so there is nothing to z-fight — which is
// why this uses per-leaf `perspective` and not a `preserve-3d` chain.
//
// THE SEAM is a 1px `border-bottom` on the top half. In the DOM the browser
// snaps that to the device pixel grid for free; drawn into a canvas it has to be
// re-derived from dpr per card and shimmers on fractional scaling. Keeping the
// glyphs as real text also means they stay crisp at any zoom and the resolved
// word is readable by assistive tech.
//
// WHY THE RUNTIME HOST and not CSS keyframes: a column makes fifteen to
// twenty-five discrete flips, and `animationend` does not fire for a cancelled
// animation (§V25) — a keyframe chain would need a timer backstop per flip per
// column. One frame body accumulating `dt` gets the settle bounce and the
// specular for free, and returns `false` the moment every column has landed.
export interface SplitFlapProps {
  /** What the board should read. */
  text?: string;
  /** Which glyphs a column walks through on its way to its letter. */
  charset?: "alphanumeric" | "letters" | "digits" | "departures";
  /** Time for one flap, in ms. */
  flapDuration?: number;
  /** Delay between one column starting and the next, in ms. */
  stagger?: number;
  /** Overshoot as a flap seats. */
  settleBounce?: number;
  /** Space between cards, in px. */
  cardGap?: number;
  /** Weight of the hairline across the middle of a card, in px. */
  seamWeight?: number;
  /** Strength of the light sweeping across a moving flap. */
  specular?: number;
  /** Depth of the 3D foreshortening, in px. */
  perspective?: number;
  /** Body of the cards. */
  cardColor?: string;
  /** The glyphs. */
  glyphColor?: string;
  /** Halt the board (leaves it on its current glyphs). */
  paused?: boolean;
  /** Renders every column already landed, with no flapping. */
  reducedMotion?: boolean;
  className?: string;
}

const CHARSETS: Record<string, string> = {
  alphanumeric: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  letters: " ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: " 0123456789",
  departures: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/",
};

interface Cell {
  root: HTMLDivElement | null;
  topGlyph: HTMLSpanElement | null;
  bottomGlyph: HTMLSpanElement | null;
  leafA: HTMLDivElement | null;
  leafAGlyph: HTMLSpanElement | null;
  leafB: HTMLDivElement | null;
  leafBGlyph: HTMLSpanElement | null;
  sheenA: HTMLDivElement | null;
  sheenB: HTMLDivElement | null;
}

/** Accelerating fall — a flap let go of, not driven down. */
const fall = (t: number) => t * t;

/** Decelerating rise with an overshoot past the stop, scaled by `bounce`. */
const seat = (t: number, bounce: number) => {
  const s = bounce * 1.7;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

export default function SplitFlap({
  text = "SHADOW",
  charset = "alphanumeric",
  flapDuration = 90,
  stagger = 45,
  settleBounce = 0.5,
  cardGap = 4,
  seamWeight = 1,
  specular = 0.55,
  perspective = 420,
  cardColor = "#17141d",
  glyphColor = "#e8e4ee",
  paused = false,
  reducedMotion = false,
  className,
}: SplitFlapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cells = useRef<Cell[]>([]);
  const drawRef = useRef<((dt: number) => void | false) | null>(null);

  const alphabet = CHARSETS[charset] ?? CHARSETS.alphanumeric;
  const columns = Math.max(1, text.length);

  // Per-column mechanism state. Lives outside React because it is written every
  // frame; React owns the card DOM, the loop owns what the cards say.
  const state = useRef<{ index: number[]; target: number[]; t: number[]; landed: boolean[]; elapsed: number }>({
    index: [],
    target: [],
    t: [],
    landed: [],
    elapsed: 0,
  });

  const live = useRef({ flapDuration, stagger, settleBounce, specular, alphabet, glyphColor });
  live.current = { flapDuration, stagger, settleBounce, specular, alphabet, glyphColor };

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused,
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  // `will-change` is armed for the length of the run and dropped the moment the
  // board lands. Leaving it on would keep every leaf promoted forever, and these
  // cards sit inside a rounded `overflow-hidden` stage — the §V29/§B12 stacking.
  const setWillChange = (on: boolean) => {
    for (const cell of cells.current) {
      if (cell?.leafA) cell.leafA.style.willChange = on ? "transform" : "";
      if (cell?.leafB) cell.leafB.style.willChange = on ? "transform" : "";
    }
  };

  const writeGlyphs = (i: number) => {
    const cell = cells.current[i];
    if (!cell) return;
    const { alphabet: set } = live.current;
    const cur = set[state.current.index[i] % set.length] ?? " ";
    const next = set[(state.current.index[i] + 1) % set.length] ?? " ";
    if (cell.topGlyph) cell.topGlyph.textContent = next;
    if (cell.bottomGlyph) cell.bottomGlyph.textContent = cur;
    if (cell.leafAGlyph) cell.leafAGlyph.textContent = cur;
    if (cell.leafBGlyph) cell.leafBGlyph.textContent = next;
  };

  /** Park a column on its target with no flap in flight. */
  const settleCell = (i: number) => {
    const cell = cells.current[i];
    if (!cell) return;
    const { alphabet: set } = live.current;
    const glyph = set[state.current.index[i] % set.length] ?? " ";
    if (cell.topGlyph) cell.topGlyph.textContent = glyph;
    if (cell.bottomGlyph) cell.bottomGlyph.textContent = glyph;
    if (cell.leafAGlyph) cell.leafAGlyph.textContent = glyph;
    if (cell.leafBGlyph) cell.leafBGlyph.textContent = glyph;
    if (cell.leafA) cell.leafA.style.transform = "rotateX(0deg)";
    if (cell.leafB) cell.leafB.style.transform = "rotateX(0deg)";
    if (cell.sheenA) cell.sheenA.style.opacity = "0";
    if (cell.sheenB) cell.sheenB.style.opacity = "0";
  };

  // Re-target whenever the word, the charset or the column count changes.
  useEffect(() => {
    const set = alphabet;
    const s = state.current;
    const upper = text.toUpperCase();

    for (let i = 0; i < columns; i++) {
      const ch = upper[i] ?? " ";
      const found = set.indexOf(ch);
      s.target[i] = found >= 0 ? found : 0;
      if (s.index[i] === undefined) s.index[i] = 0;
      s.t[i] = 0;
      s.landed[i] = reducedMotion || s.index[i] === s.target[i];
    }
    s.index.length = columns;
    s.target.length = columns;
    s.elapsed = 0;

    if (reducedMotion) {
      // Reduced motion never flaps. The board simply reads the word — and it must
      // do so on the first paint, because a component that hides its own content
      // behind an animation strands that content for anyone who opted out (§V34).
      for (let i = 0; i < columns; i++) {
        s.index[i] = s.target[i];
        s.landed[i] = true;
        settleCell(i);
      }
      setWillChange(false);
      return;
    }

    for (let i = 0; i < columns; i++) {
      if (s.landed[i]) settleCell(i);
      else writeGlyphs(i);
    }
    setWillChange(true);
    loop.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, alphabet, columns, reducedMotion]);

  useEffect(() => {
    drawRef.current = (dt) => {
      const s = state.current;
      const { flapDuration: ms, stagger: gap, settleBounce: bounce, specular: spec } = live.current;
      s.elapsed += dt * 1000;

      let moving = false;

      for (let i = 0; i < s.index.length; i++) {
        const cell = cells.current[i];
        if (!cell) continue;
        if (s.landed[i]) continue;

        // Not this column's turn yet — but the board as a whole is still running,
        // so the loop must not read the gap as "everything has landed".
        if (s.elapsed < i * gap) {
          moving = true;
          continue;
        }

        moving = true;
        s.t[i] += (dt * 1000) / Math.max(16, ms);

        while (s.t[i] >= 1) {
          s.t[i] -= 1;
          s.index[i] = (s.index[i] + 1) % live.current.alphabet.length;
          if (s.index[i] === s.target[i]) {
            s.landed[i] = true;
            s.t[i] = 0;
            settleCell(i);
            break;
          }
          writeGlyphs(i);
        }
        if (s.landed[i]) continue;

        const t = s.t[i];
        // The falling leaf owns the first half of the flap and the rising one the
        // second, which is the order the real mechanism moves in — one flap has
        // to be out of the way before the next can seat.
        let a = 0;
        let b = 0;
        if (t < 0.5) {
          a = -90 * fall(t / 0.5);
          b = 90;
        } else {
          a = -90;
          b = 90 * (1 - seat((t - 0.5) / 0.5, bounce));
        }

        if (cell.leafA) cell.leafA.style.transform = `rotateX(${a}deg)`;
        if (cell.leafB) cell.leafB.style.transform = `rotateX(${b}deg)`;
        // Brightest edge-on, which is when a real flap catches the light.
        if (cell.sheenA) cell.sheenA.style.opacity = `${Math.abs(Math.sin((a * Math.PI) / 180)) * spec}`;
        if (cell.sheenB) cell.sheenB.style.opacity = `${Math.abs(Math.sin((b * Math.PI) / 180)) * spec}`;
      }

      if (!moving) {
        setWillChange(false);
        return false;
      }
    };
    return () => {
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topFace = `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0)), ${cardColor}`;
  const bottomFace = `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0)), ${cardColor}`;
  // The seam is two lines, not one. A black hairline alone vanishes against a
  // dark card — it needs the catch-light on the lower flap's leading edge to read
  // as a gap between two physical halves rather than as a slightly darker row.
  const seam = `${seamWeight}px solid rgba(0,0,0,0.9)`;
  const catchLight = "1px solid rgba(255,255,255,0.09)";
  const sheen = "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))";

  return (
    <div
      ref={containerRef}
      className={cn("inline-flex", className)}
      style={{ gap: cardGap, color: glyphColor }}
      role="img"
      aria-label={text}
    >
      {Array.from({ length: columns }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), root: el };
          }}
          className="relative h-[1.4em] w-[0.95em] shrink-0 rounded-[0.08em]"
          style={{ perspective: `${perspective}px` }}
        >
          {/* Static top — the glyph being arrived at, uncovered as leaf A falls. */}
          <div
            className="absolute inset-x-0 top-0 h-1/2 overflow-hidden rounded-t-[0.08em]"
            style={{ background: topFace, borderBottom: seam }}
          >
            <span
              ref={(el) => {
                cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), topGlyph: el };
              }}
              className="absolute inset-x-0 top-0 flex h-[200%] items-center justify-center"
            />
          </div>

          {/* Static bottom — the glyph being left, covered as leaf B seats. */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden rounded-b-[0.08em]"
            style={{ background: bottomFace, borderTop: catchLight }}
          >
            <span
              ref={(el) => {
                cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), bottomGlyph: el };
              }}
              className="absolute inset-x-0 -top-full flex h-[200%] items-center justify-center"
            />
          </div>

          {/* Leaf A — falls away. */}
          <div
            ref={(el) => {
              cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), leafA: el };
            }}
            className="absolute inset-x-0 top-0 h-1/2 origin-bottom overflow-hidden rounded-t-[0.08em]"
            style={{ background: topFace, borderBottom: seam }}
          >
            <span
              ref={(el) => {
                cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), leafAGlyph: el };
              }}
              className="absolute inset-x-0 top-0 flex h-[200%] items-center justify-center"
            />
            <div
              ref={(el) => {
                cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), sheenA: el };
              }}
              className="pointer-events-none absolute inset-0"
              style={{ background: sheen, opacity: 0 }}
            />
          </div>

          {/* Leaf B — rises into place. */}
          <div
            ref={(el) => {
              cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), leafB: el };
            }}
            className="absolute inset-x-0 bottom-0 h-1/2 origin-top overflow-hidden rounded-b-[0.08em]"
            style={{ background: bottomFace, borderTop: catchLight }}
          >
            <span
              ref={(el) => {
                cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), leafBGlyph: el };
              }}
              className="absolute inset-x-0 -top-full flex h-[200%] items-center justify-center"
            />
            <div
              ref={(el) => {
                cells.current[i] = { ...(cells.current[i] ?? ({} as Cell)), sheenB: el };
              }}
              className="pointer-events-none absolute inset-0"
              style={{ background: sheen, opacity: 0 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
