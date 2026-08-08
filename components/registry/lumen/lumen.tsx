"use client";

import { useMemo, useRef, type RefObject } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionTemplate,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

// Body copy that lights up as you read it: words ahead of the fold sit dim and
// slightly out of focus, brighten as they cross, and stay lit behind you. A band of
// amethyst bloom travels along the leading edge.
//
// The lit state is `currentColor`, not a hardcoded white — the copy inherits the
// surrounding text colour, so the effect works in either theme. The tunable colour
// is only the bloom.
//
// Scroll source follows the bench convention: pass `scrollContainerRef` to track a
// scrollable ancestor, omit it to track the window.
export interface LumenProps {
  /** Copy to light up. Split on whitespace; each word animates independently. */
  text?: string;
  className?: string;
  /** Opacity of words that haven't been reached yet, 0 → 0.6. */
  dimOpacity?: number;
  /** How many words are mid-transition at once — the width of the reading band. */
  fadeSpan?: number;
  /** Blur on an unreached word, in px. */
  blurAmount?: number;
  /** Fraction of the scroll pass at which the first word begins to brighten. */
  startOffset?: number;
  /** Fraction of the scroll pass by which the last word is fully lit. */
  endOffset?: number;
  /** Bloom colour on the leading edge (hex). */
  highlightColor?: string;
  /** Scrollable ancestor to track; window when omitted. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** When true, the copy renders fully lit and static. */
  reducedMotion?: boolean;
}

interface WordProps {
  word: string;
  progress: MotionValue<number>;
  start: number;
  end: number;
  dimOpacity: number;
  blurAmount: number;
  highlightColor: string;
  still: boolean;
}

// One component per word so each can own its own hooks — mapping useTransform
// inside the parent would break the rules of hooks the moment the copy changes.
function Word({
  word,
  progress,
  start,
  end,
  dimOpacity,
  blurAmount,
  highlightColor,
  still,
}: WordProps) {
  const opacity = useTransform(progress, [start, end], [dimOpacity, 1], {
    clamp: true,
  });
  const blurPx = useTransform(progress, [start, end], [blurAmount, 0], {
    clamp: true,
  });
  const filter = useMotionTemplate`blur(${blurPx}px)`;

  // Bloom peaks halfway through the word's own window, so the glow rides the
  // leading edge instead of pooling at the start or the end.
  const glow = useTransform(
    progress,
    [start, (start + end) / 2, end],
    [0, 1, 0],
    { clamp: true },
  );
  const glowPx = useTransform(glow, (g) => g * 12);
  const textShadow = useMotionTemplate`0 0 ${glowPx}px ${highlightColor}`;

  if (still) return <span className="mr-[0.25em] inline-block">{word}</span>;

  return (
    <motion.span
      className="mr-[0.25em] inline-block will-change-[opacity,filter]"
      style={{ opacity, filter, textShadow }}
    >
      {word}
    </motion.span>
  );
}

export default function Lumen({
  text = "",
  className,
  dimOpacity = 0.15,
  fadeSpan = 6,
  blurAmount = 4,
  startOffset = 0.15,
  endOffset = 0.6,
  highlightColor = "#a855f7",
  scrollContainerRef,
  reducedMotion = false,
}: LumenProps) {
  const targetRef = useRef<HTMLParagraphElement>(null);
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    ...(scrollContainerRef ? { container: scrollContainerRef } : {}),
    offset: ["start end", "end start"],
  });

  // startOffset/endOffset carve the active window out of the element's full pass
  // through the viewport, so the copy isn't already lit the moment it appears.
  const lo = Math.min(startOffset, endOffset - 0.05);
  const progress = useTransform(scrollYProgress, [lo, endOffset], [0, 1], {
    clamp: true,
  });

  const total = words.length || 1;
  const span = Math.min(Math.max(fadeSpan, 1), total);

  return (
    <p ref={targetRef} className={cn("text-balance", className)}>
      {words.map((word, i) => (
        <Word
          key={`${word}-${i}`}
          word={word}
          progress={progress}
          start={i / total}
          end={Math.min(1, (i + span) / total)}
          dimOpacity={dimOpacity}
          blurAmount={blurAmount}
          highlightColor={highlightColor}
          still={reducedMotion}
        />
      ))}
    </p>
  );
}
