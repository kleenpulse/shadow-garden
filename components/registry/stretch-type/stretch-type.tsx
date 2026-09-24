"use client";

import { type RefObject } from "react";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

// Type that squashes and stretches with how fast you are scrolling, not with how
// far you have scrolled. Those are different components: scroll *position* gives
// you a scrubber, where the same place on the page always looks the same. Scroll
// *velocity* gives you material — the word deforms under load and recovers when
// you stop, so the same place looks different depending on how you arrived at it.
//
// The deformation is volume-preserving on purpose. Growing one axis while the
// other gives way is the squash-and-stretch principle out of classical
// animation: a letterform that grows without narrowing has not been pulled, it
// has been scaled, and the eye reads the difference immediately.
//
// The wave along the word is a physical consequence rather than a scheduled one.
// Every glyph springs toward the *same* velocity signal, but each one is softer
// than the last, so the tail of the word arrives late and leaves late without a
// single delay value anywhere in this file. Change the text and the wave adapts;
// a stagger built out of timers would need re-tuning per string.
//
// No animation loop of its own. `useVelocity` differentiates a motion value that
// motion is already updating, so the whole component is derived state hanging off
// one scroll listener.

export interface StretchTypeProps {
  /** The word or phrase to deform. Split per character. */
  text?: string;
  className?: string;
  /** How far the leading glyph deforms at full velocity, as a fraction. */
  stretch?: number;
  /** Degrees of lean at full velocity. Sign follows scroll direction. */
  skew?: number;
  /** Extra letter-spacing at full velocity, in em. */
  tracking?: number;
  /** Spring stiffness of the leading glyph. */
  stiffness?: number;
  /** Spring damping, shared by every glyph. */
  damping?: number;
  /** Scroll speed in px/s that counts as full deformation. */
  maxVelocity?: number;
  /** How much softer the last glyph's spring is than the first. */
  stagger?: number;
  /** Which axis grows under load; the other one gives up the volume. */
  direction?: "vertical" | "horizontal";
  /**
   * Scrollable ancestor whose scrolling drives the deformation. Tracks the
   * window when omitted.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Hold every glyph at rest. The word still renders, it just stops deforming. */
  reducedMotion?: boolean;
}

export default function StretchType({
  text = "MOTION GARDEN",
  className,
  stretch = 0.55,
  skew = 12,
  tracking = 0.12,
  stiffness = 260,
  damping = 22,
  maxVelocity = 1600,
  stagger = 0.7,
  direction = "vertical",
  reducedMotion = false,
  scrollContainerRef,
}: StretchTypeProps) {
  const { scrollY } = useScroll({ container: scrollContainerRef });
  const velocity = useVelocity(scrollY);

  // Normalised to [-1, 1] and clamped, so `maxVelocity` is a real ceiling rather
  // than a scale factor. Past it the word is fully deformed and scrolling harder
  // does nothing — which is the point: an unclamped mapping lets one trackpad
  // flick tear the type apart on a scroll nobody intended to be dramatic.
  const signal = useTransform(velocity, [-maxVelocity, 0, maxVelocity], [-1, 0, 1], {
    clamp: true,
  });

  const characters = [...text];
  const last = Math.max(1, characters.length - 1);

  return (
    <span className={cn("inline-flex font-display text-5xl text-ink select-none", className)}>
      {/* Same split-text bargain the rest of the bench makes: a glyph per element
          makes a screen reader spell the line out and makes Ctrl+F match nothing
          across the boundaries, so the split rendering is hidden outright and the
          real string sits beside it. */}
      <span aria-hidden>
        {characters.map((character, index) =>
          character === " " ? (
            // Left out of the inline-block treatment deliberately: a space has no
            // glyph to scale, and an inline-block containing only whitespace
            // collapses to zero width mid-scroll, running the words together.
            <span key={`space-${index}`}> </span>
          ) : (
            <Glyph
              key={`${character}-${index}`}
              character={character}
              signal={signal}
              // 0 at the head of the word, 1 at the tail. Counted over every
              // character including the spaces, so the wave crosses the gap
              // instead of restarting on the second word.
              position={index / last}
              stretch={stretch}
              skew={skew}
              tracking={tracking}
              stiffness={stiffness}
              damping={damping}
              stagger={stagger}
              direction={direction}
              reducedMotion={reducedMotion}
            />
          ),
        )}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

function Glyph({
  character,
  signal,
  position,
  stretch,
  skew,
  tracking,
  stiffness,
  damping,
  stagger,
  direction,
  reducedMotion,
}: {
  character: string;
  signal: MotionValue<number>;
  position: number;
  stretch: number;
  skew: number;
  tracking: number;
  stiffness: number;
  damping: number;
  stagger: number;
  direction: "vertical" | "horizontal";
  reducedMotion: boolean;
}) {
  // The whole stagger, in one line. The floor keeps the tail responsive: with
  // stiffness near zero the last glyph stops following the scroll altogether and
  // the word reads as broken rather than as elastic.
  const softness = Math.max(1 - stagger * position, 0.15);
  const springed = useSpring(signal, {
    stiffness: Math.max(stiffness * softness, 10),
    damping,
    // Deformation has to arrive with the scroll, not after it. Mass is what
    // separates "the type is being pulled" from "the type is being animated".
    mass: 0.35,
  });

  // Called unconditionally so hook order never changes; the still value is what
  // gets read when the OS asks for less motion.
  const still = useMotionValue(0);
  const value = reducedMotion ? still : springed;

  const load = useTransform(value, (v) => Math.abs(v));
  const grow = useTransform(load, (v) => 1 + v * stretch);
  // Volume compensation is deliberately partial — a true 1/grow reciprocal makes
  // the glyph look squeezed through a gap. Two thirds of the way reads as elastic.
  const give = useTransform(load, (v) => 1 - v * stretch * 0.66);
  const lean = useTransform(value, (v) => -v * skew);
  const spacing = useTransform(load, (v) => `${v * tracking}em`);

  const vertical = direction === "vertical";

  return (
    <motion.span
      className="inline-block"
      style={{
        scaleY: vertical ? grow : give,
        scaleX: vertical ? give : grow,
        skewX: lean,
        letterSpacing: spacing,
        // Growth happens away from the baseline, the way a letterform under
        // tension actually behaves. Scaling about the centre floats the word off
        // its own line and the whole phrase looks like it is drifting.
        transformOrigin: vertical ? "50% 100%" : "0% 50%",
      }}
    >
      {character}
    </motion.span>
  );
}
