"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Copy that arrives classified and declassifies a word at a time. The real text is
// always in the DOM — the bars are `pointer-events-none` overlays sitting on top of
// it — so selection, find-in-page and screen readers get the sentence whether or not
// the animation ever runs.
//
// The stagger is `transition-delay`, never a per-word `setTimeout`. A timer orphaned
// by an effect re-run mid-flight strands its word under a bar permanently (§V32,
// the lesson Masonry paid for). CSS delays are owned by the element, so a re-render
// re-declares them instead of leaking them.
//
// One consequence worth stating: every path out of the effect below sets `revealed`
// to true first. There is no ordering of prop changes, unmounts or loop ticks that
// can leave the copy sitting under a bar with nothing scheduled to lift it.
export interface RedactProps {
  /** The copy to classify. */
  text?: string;
  /** How a bar leaves: retracted in place, pulled clear, or peeled off the page. */
  mode?: "wipe" | "slide" | "lift";
  /** The order words declassify in. */
  direction?: "ltr" | "rtl" | "center-out" | "random";
  /** How long one bar takes to clear its own word, in ms. */
  duration?: number;
  /** Gap between one word starting to clear and the next, in ms. */
  stagger?: number;
  /** Dead air before the first bar moves, in ms. */
  startDelay?: number;
  /** How far each bar overhangs its word, in px. */
  barPadding?: number;
  /** Re-classify and declassify forever instead of settling on plain text. */
  loop?: boolean;
  /** Seconds the plain text stays legible before the bars come back down. */
  interval?: number;
  /** Solid ink of the bars. */
  barColor?: string;
  /** Hairline riding the retreating edge of each bar. */
  edgeColor?: string;
  /** Renders fully declassified and pins the loop off. */
  reducedMotion?: boolean;
  className?: string;
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function Redact({
  text = "Every record of the assignment was destroyed at the subject's request.",
  mode = "wipe",
  direction = "ltr",
  duration = 420,
  stagger = 70,
  startDelay = 300,
  barPadding = 3,
  loop = false,
  interval = 3.5,
  barColor = "#15101f",
  edgeColor = "#a855f7",
  reducedMotion = false,
  className,
}: RedactProps) {
  // Whitespace is kept as its own token so the bars land on words, not on the gaps
  // between them — a bar that spans a space reads as a highlighter, not a censor.
  const tokens = useMemo(() => text.split(/(\s+)/).filter((t) => t.length > 0), [text]);
  const wordIndices = useMemo(
    () => tokens.map((t, i) => (/^\s+$/.test(t) ? -1 : i)).filter((i) => i >= 0),
    [tokens],
  );
  const count = wordIndices.length;

  // Stagger slot per word. Deterministic for every direction including `random`, so
  // a re-render never reshuffles a reveal that is already in flight.
  const slots = useMemo(() => {
    const order = Array.from({ length: count }, (_, i) => i);
    if (direction === "rtl") return order.map((i) => count - 1 - i);
    if (direction === "center-out") {
      const mid = (count - 1) / 2;
      const byDistance = [...order].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
      const rank = new Array<number>(count);
      byDistance.forEach((word, r) => {
        rank[word] = r;
      });
      return rank;
    }
    if (direction === "random") {
      const rank = [...order];
      let seed = 0x9e3779b9;
      for (let i = count - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const j = seed % (i + 1);
        [rank[i], rank[j]] = [rank[j], rank[i]];
      }
      return rank;
    }
    return order;
  }, [count, direction]);

  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    // Reduced motion never runs the reveal at all — the copy is simply legible.
    // Crushing the duration in CSS would hide the symptom and leave the content
    // gated behind an animation nobody asked for (§V24, §V34).
    if (reducedMotion) {
      setRevealed(true);
      return;
    }

    // The full sweep: the last word's delay plus its own travel.
    const sweep = startDelay + Math.max(0, count - 1) * stagger + duration;

    if (!loop) {
      setRevealed(true);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const step = (next: boolean) => {
      setRevealed(next);
      timer = setTimeout(
        () => {
          if (alive) step(!next);
        },
        next ? sweep + interval * 1000 : sweep,
      );
    };
    step(true);

    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [reducedMotion, loop, interval, startDelay, stagger, duration, count]);

  const hp = barPadding * 0.6;

  let slot = -1;

  return (
    <span className={cn("relative", className)}>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
        slot += 1;
        // Reduced motion must kill the DELAY, not just the duration. Setting
        // `revealed` alone is not enough: the reveal is carried entirely by
        // transition-delay, so the copy would sit under its bars for the length
        // of the whole sweep — eleven seconds at the top of the ranges — and the
        // globals.css backstop only crushes duration, so it cannot save this
        // (§V24, §V34). Measured: reduced motion rendered the memo fully
        // redacted and left it there.
        const delay = reducedMotion
          ? 0
          : revealed
            ? startDelay + slots[slot] * stagger
            : slots[slot] * stagger;
        const transition = reducedMotion
          ? "none"
          : `transform ${duration}ms ${EASE} ${delay}ms, clip-path ${duration}ms ${EASE} ${delay}ms, opacity ${duration}ms ${EASE} ${delay}ms`;

        // `wipe` retracts the bar in place, so the bar is clipped while the hairline
        // travels; the other two carry both away on the same transform.
        const carried =
          mode === "slide"
            ? `translateX(${revealed ? "110%" : "0%"})`
            : mode === "lift"
              ? `translate(${revealed ? "6%" : "0%"}, ${revealed ? "-150%" : "0%"}) rotate(${revealed ? -7 : 0}deg)`
              : `translateX(${revealed ? "100%" : "0%"})`;

        // The hairline sits 4px outside its box at both ends of the travel, and
        // neither offset is slop. At rest it would otherwise stand at every
        // word's left edge, turning a solid redaction into a row of tick marks;
        // at the end a flat 100% parks it exactly on the clip boundary, where
        // sub-pixel rounding strands a stray tick beside every word whose width
        // lands on a fraction. Both were visible on the first build.
        const edgeCarried =
          mode === "slide"
            ? `translateX(${revealed ? "110%" : "-4px"})`
            : mode === "lift"
              ? carried
              : `translateX(${revealed ? "calc(100% + 4px)" : "-4px"})`;

        const edgeStyle: React.CSSProperties = {
          transition,
          transform: edgeCarried,
          opacity: mode === "lift" && revealed ? 0 : 1,
        };
        // `lift` peels the bar upward, so the edge that retreats past the text is
        // the bottom one — a left border would ride up sideways and read as noise.
        if (mode === "lift") edgeStyle.borderBottom = `2px solid ${edgeColor}`;
        else edgeStyle.borderLeft = `2px solid ${edgeColor}`;

        return (
          <span key={i} className="relative inline-block">
            {token}
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                top: -barPadding,
                bottom: -barPadding,
                left: -hp,
                right: -hp,
                // `lift` peels off the page, so it must not be clipped by its own box.
                overflow: mode === "lift" ? "visible" : "hidden",
              }}
            >
              <span
                className="absolute inset-0"
                style={{
                  backgroundColor: barColor,
                  transition,
                  transform: mode === "wipe" ? undefined : carried,
                  clipPath:
                    mode === "wipe"
                      ? `inset(0 0 0 ${revealed ? "100%" : "0%"})`
                      : undefined,
                  opacity: mode === "lift" && revealed ? 0 : 1,
                }}
              />
              {/* Full-width box carrying a single hairline on one edge. Translating it
                  by 100% walks that edge exactly one word-width, which keeps it locked
                  to the clip boundary in `wipe` without measuring anything. */}
              <span className="absolute inset-0" style={edgeStyle} />
            </span>
          </span>
        );
      })}
    </span>
  );
}
