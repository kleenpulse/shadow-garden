"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Text whose words keep their identity when the line breaks move.
//
// Narrow the measure and a normal paragraph re-wraps instantly: every word
// below the first change is somewhere else, and nothing tells you they are the
// same words. Here each word is its own element with a stable key, so a word
// that survives a change travels to its new position instead of being
// destroyed and re-created there — the reader's eye keeps hold of it. That
// continuity is the entire component; the springs are just how it is spent.
//
// Three calls that are easy to get wrong:
//
//   - `layout="position"` rather than `layout`. Position-only skips motion's
//     scale correction entirely, so glyphs cannot be stretched by a box that
//     resolved a pixel wider on one side of the change.
//   - `popLayout` rather than the default exit mode. A leaving word has to come
//     out of flow immediately or the survivors wait for its fade before they
//     close the gap, and the reflow arrives after the thing that caused it.
//   - No ResizeObserver, on purpose. A live browser-window drag would fire
//     this on every frame of the drag, which is both ruinous and wrong: a
//     continuous resize should track continuously. Reflow animates discrete
//     changes — the measure, or the sentence.
export type ReflowAlign = "left" | "center" | "right";

export interface ReflowProps {
  /** Rendered in order; with `auto` on, the component cycles through them.
   *  Words shared between consecutive phrases keep their identity and travel. */
  phrases?: string[];
  /** Which phrase to show. Leave undefined and the component owns the index. */
  index?: number;
  /** Width of the text column as a percentage of its container — the measure.
   *  Dragging this is the reflow, without a word changing. */
  columnWidth?: number;
  /** Spring tension on the travel. */
  stiffness?: number;
  /** Spring friction on the travel. */
  damping?: number;
  /** Delay between one word starting its travel and the next, in ms. The
   *  index is capped, so a long paragraph cannot leave its tail waiting. */
  stagger?: number;
  /** Size a word enters at and leaves at. */
  enterScale?: number;
  /** Space between words, in em. A margin rather than a space character, so a
   *  word leaving the sentence does not strand the gap that followed it. */
  wordGap?: number;
  /** Leading. */
  lineHeight?: number;
  /** Text alignment. */
  align?: ReflowAlign;
  /** Advance through the phrases on a timer. */
  auto?: boolean;
  /** Time on each phrase, in ms. */
  interval?: number;
  /** Tint a word for as long as it is travelling. A debugging affordance that
   *  turned out to be worth shipping — it is the only way to see that a word
   *  moved rather than being replaced. */
  traceMoves?: boolean;
  /** The trace tint. */
  accentColor?: string;
  /** Hold on the current phrase. */
  paused?: boolean;
  /** Words land at their final positions with no travel and no cycling. The
   *  sentence is never hidden by this component, so nothing is withheld except
   *  the movement. */
  reducedMotion?: boolean;
  className?: string;
}

/** However many words start moving at once, the last of them waits this many
 *  steps and no more. Uncapped, a hundred-word phrase leaves its tail sitting
 *  visibly still for over a second while the head has already landed. */
const STAGGER_CAP = 20;

interface WordProps {
  text: string;
  animateLayout: boolean;
  spring: { type: "spring"; stiffness: number; damping: number };
  delay: number;
  enterScale: number;
  wordGap: number;
  traceMoves: boolean;
  accentColor: string;
}

function Word({
  text,
  animateLayout,
  spring,
  delay,
  enterScale,
  wordGap,
  traceMoves,
  accentColor,
}: WordProps) {
  const [moving, setMoving] = useState(false);

  return (
    <motion.span
      layout={animateLayout ? "position" : false}
      onLayoutAnimationStart={() => traceMoves && setMoving(true)}
      onLayoutAnimationComplete={() => setMoving(false)}
      initial={{ opacity: 0, scale: enterScale }}
      animate={{ opacity: 1, scale: 1 }}
      // A leaving word is out of flow and holding its old position while an
      // arriving one springs through that same spot, so the two overlap for as
      // long as the exit lasts. Shorter than the entrance on purpose: the
      // collision is unavoidable, its duration is not.
      exit={{ opacity: 0, scale: enterScale, transition: { duration: 0.15 } }}
      transition={
        animateLayout
          ? {
              layout: { ...spring, delay },
              opacity: { duration: 0.22 },
              scale: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
            }
          : { duration: 0 }
      }
      className="inline-block"
      // `color` is left to React, never handed to motion: motion writes
      // MotionValue-bound styles straight to the DOM, and a React render can
      // no longer clear what it never set. A plain style toggle with a CSS
      // transition costs nothing and reverts cleanly.
      style={{
        marginRight: `${wordGap}em`,
        color: moving && traceMoves ? accentColor : undefined,
        // Only while the trace is on. Left unconditional it also fades the
        // theme swap — every word interpolating from its dark-mode colour to
        // its light-mode one — and anything that samples a colour during those
        // 260ms reads the theme that was just left behind.
        transition: traceMoves ? "color 260ms ease-out" : undefined,
      }}
    >
      {text}
    </motion.span>
  );
}

export default function Reflow({
  phrases = [],
  index,
  columnWidth = 100,
  stiffness = 340,
  damping = 34,
  stagger = 14,
  enterScale = 0.82,
  wordGap = 0.3,
  lineHeight = 1.6,
  align = "left",
  auto = true,
  interval = 3600,
  traceMoves = false,
  accentColor = "#a855f7",
  paused = false,
  reducedMotion = false,
  className,
}: ReflowProps) {
  const [self, setSelf] = useState(0);
  const controlled = index !== undefined;
  const current = controlled ? index : self;
  const halted = paused || reducedMotion;

  useEffect(() => {
    if (controlled || !auto || halted || phrases.length < 2) return;
    const id = setTimeout(
      () => setSelf((n) => (n + 1) % phrases.length),
      Math.max(200, interval),
    );
    return () => clearTimeout(id);
    // `current` is the dep that matters: each phrase schedules the next one,
    // so a paused-then-resumed component starts a fresh full interval rather
    // than firing whatever was left on a stale timer.
  }, [controlled, auto, halted, interval, phrases.length, current]);

  const text = phrases[current % Math.max(1, phrases.length)] ?? "";

  // Keyed by word plus which occurrence of that word it is. Two "the"s in one
  // sentence are two different objects and must not swap places when a third
  // appears between them; the same "shadow" in two consecutive phrases is one
  // object and must travel.
  const words = useMemo(() => {
    const seen = new Map<string, number>();
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const nth = (seen.get(word) ?? 0) + 1;
        seen.set(word, nth);
        return { key: `${word}#${nth}`, text: word };
      });
  }, [text]);

  const spring = {
    type: "spring" as const,
    stiffness,
    damping,
  };

  return (
    <div
      className={cn("w-full", className)}
      style={{
        textAlign: align,
        lineHeight,
      }}
    >
      <div
        // The measure is on an inner box so the outer one keeps its full width
        // and the alignment below has something to align inside of.
        //
        // No CSS transition on this width, ever. motion measures the new layout
        // synchronously in a layout effect, and at that instant a transitioning
        // width still reads as the old one — so the delta is zero, no word
        // animates, and the column then slides over 200ms with the text
        // re-wrapping underneath it completely unanimated. Measured: 0 words in
        // flight across 70 frames. The column snaps; the words carry the
        // motion. That is the entire component.
        className={cn(
          align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : null,
        )}
        style={{ width: `${columnWidth}%` }}
      >
        {/* No LayoutGroup. These words are siblings in one projection tree and
            already measure together; a group would additionally re-measure
            every word whenever any single one re-renders, which with
            `traceMoves` on is once per word per travel. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {words.map((word, i) => (
            <Word
              key={word.key}
              text={word.text}
              animateLayout={!reducedMotion}
              spring={spring}
              delay={(Math.min(i, STAGGER_CAP) * stagger) / 1000}
              enterScale={enterScale}
              wordGap={wordGap}
              traceMoves={traceMoves}
              accentColor={accentColor}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
