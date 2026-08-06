"use client";

import { useEffect, useMemo, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { cn } from "@/lib/utils";

// Type with mass.
//
// There is no deformation timeline in here, and that is the whole design. Each
// body is driven by a spring, and the squash and the stretch are read back off
// that spring's own velocity and position — a fast body is tall and thin
// because it is moving fast, and a landed body is short and wide because the
// spring has overshot below the floor. Author the two as separate keyframe
// tracks and they drift out of phase with the motion they are supposed to be
// caused by, which is the exact tell that makes cheap kinetic type look like a
// GIF of itself.
//
// Two consequences worth knowing before you tune it:
//
//   - The floor is real. Spring travel below rest is clamped out of the
//     translation and spent on compression instead, so a body never sinks
//     through the baseline it is standing on.
//   - Anticipation is that same compression, run deliberately and early. The
//     wind-up before a jump is not a separate effect; it is the body loading
//     the spring.
export type KineticSplit = "character" | "word";
export type KineticTrigger = "loop" | "hover";

export interface KineticProps {
  /** The line to animate. */
  text?: string;
  /** Spring tension. Higher launches harder and settles sooner. */
  stiffness?: number;
  /** Spring friction. Low overshoots and rings; high arrives dead. */
  damping?: number;
  /** Weight of a body. Heavier lags further behind its own intent. */
  mass?: number;
  /** Peak of the jump, in px. */
  jumpHeight?: number;
  /** Depth of the wind-up before the launch, in px of spring travel — spent as
   *  compression rather than as downward movement. */
  anticipation?: number;
  /** How long the wind-up takes, in ms. */
  windUp?: number;
  /** How hard velocity and floor contact deform a body. 0 renders rigid type
   *  that still jumps; the jump alone reads as weightless. */
  squash?: number;
  /** Delay between one body launching and the next, in ms. */
  stagger?: number;
  /** Rest between one pass finishing and the next beginning, in ms. */
  interval?: number;
  /** What starts a pass. */
  trigger?: KineticTrigger;
  /** Whether a body is one glyph or one word. */
  split?: KineticSplit;
  /** Contact shadow under each body, tightening as it rises. */
  shadow?: boolean;
  /** The contact shadow. */
  accentColor?: string;
  /** Bodies come to rest. */
  paused?: boolean;
  /** Bodies render at rest and never launch. The text is never hidden by this
   *  component, so there is nothing to restore — only motion to withhold. */
  reducedMotion?: boolean;
  className?: string;
}

interface BodyProps {
  text: string;
  index: number;
  halted: boolean;
  cycle: number;
  stiffness: number;
  damping: number;
  mass: number;
  jumpHeight: number;
  anticipation: number;
  windUp: number;
  squash: number;
  stagger: number;
  interval: number;
  repeat: boolean;
  shadow: boolean;
  accentColor: string;
}

/** Fast enough to be fully stretched, as a multiple of the jump height per
 *  second. Scaling the reference off the height keeps the deformation reading
 *  the same at 8px and at 80px instead of pinning at either end. */
const SPEED_REF = 14;
/** Floor penetration that reads as a full compression, likewise relative. */
const DEPTH_REF = 0.35;

function Body({
  text,
  index,
  halted,
  cycle,
  stiffness,
  damping,
  mass,
  jumpHeight,
  anticipation,
  windUp,
  squash,
  stagger,
  interval,
  repeat,
  shadow,
  accentColor,
}: BodyProps) {
  // Intent, then physics. The tween writes where the body means to be; the
  // spring decides where it actually is. Everything expressive — the lag, the
  // overshoot, the follow-through after the target has already come to rest —
  // lives in the gap between the two, and none of it is authored.
  const target = useMotionValue(0);
  const y = useSpring(target, { stiffness, damping, mass });
  const velocity = useVelocity(y);

  const speedRef = Math.max(120, jumpHeight * SPEED_REF);
  const depthRef = Math.max(2, jumpHeight * DEPTH_REF);

  const scaleY = useTransform<number, number>(
    [velocity, y],
    ([v, py]: number[]) => {
      const stretch = Math.min(1, Math.abs(v) / speedRef);
      const depth = Math.min(1, Math.max(0, py) / depthRef);
      return 1 + squash * (stretch * 0.75 - depth * 1.05);
    },
  );
  const scaleX = useTransform<number, number>(
    [velocity, y],
    ([v, py]: number[]) => {
      const stretch = Math.min(1, Math.abs(v) / speedRef);
      const depth = Math.min(1, Math.max(0, py) / depthRef);
      return 1 - squash * (stretch * 0.42 - depth * 0.62);
    },
  );

  // The floor. Everything the spring wants to do below rest is deformation,
  // not displacement — without this clamp a heavy body visibly sinks through
  // the line it is standing on, and the landing reads as a bug rather than as
  // weight.
  const lift = useTransform(y, (v: number) => Math.min(0, v));

  const shadowScale = useTransform(y, [-jumpHeight - 1, 0], [0.34, 1], {
    clamp: true,
  });
  const shadowFade = useTransform(y, [-jumpHeight - 1, 0], [0.08, 0.4], {
    clamp: true,
  });

  useEffect(() => {
    if (halted) {
      target.set(0);
      return;
    }
    const rise = 110;
    const fall = 190;
    const wind = anticipation > 0 ? Math.max(16, windUp) : 0;
    const total = wind + rise + fall;

    const controls = animate(
      target,
      wind > 0 ? [0, anticipation, -jumpHeight, 0] : [0, -jumpHeight, 0],
      {
        duration: total / 1000,
        times:
          wind > 0
            ? [0, wind / total, (wind + rise) / total, 1]
            : [0, rise / (rise + fall), 1],
        ease: "linear",
        delay: (index * stagger) / 1000,
        ...(repeat
          ? { repeat: Infinity, repeatDelay: Math.max(0, interval) / 1000 }
          : {}),
      },
    );
    return () => controls.stop();
  }, [
    target,
    halted,
    cycle,
    index,
    jumpHeight,
    anticipation,
    windUp,
    stagger,
    interval,
    repeat,
  ]);

  return (
    <span className="relative inline-block">
      {/* Inset and blurred. Flush to the glyph box, adjacent shadows in a
          monospace line butt together into one continuous bar and read as a
          highlighter mark rather than as twelve separate objects standing on a
          floor. */}
      {shadow ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-[12%] bottom-[-0.16em] h-[0.12em] rounded-[50%] blur-[1.5px]"
          style={{
            backgroundColor: accentColor,
            scaleX: shadowScale,
            opacity: shadowFade,
          }}
        />
      ) : null}
      {/* `origin-bottom` as a class, not an inline transformOrigin: motion owns
          the style attribute on an animating element and rewrites the origin
          out from under an inline value. A compression has to happen against
          the floor — origin-center makes the body shrink away from it, which
          reads as shrinking rather than as landing. */}
      <motion.span
        className="inline-block origin-bottom whitespace-pre"
        style={{ y: lift, scaleX, scaleY }}
      >
        {text}
      </motion.span>
    </span>
  );
}

export default function Kinetic({
  text = "",
  stiffness = 620,
  damping = 20,
  mass = 1,
  jumpHeight = 26,
  anticipation = 7,
  windUp = 130,
  squash = 0.62,
  stagger = 34,
  interval = 2400,
  trigger = "loop",
  split = "character",
  shadow = true,
  accentColor = "#a855f7",
  paused = false,
  reducedMotion = false,
  className,
}: KineticProps) {
  const halted = paused || reducedMotion;
  // Bumped per hover pass. Every body's animation effect depends on it, so one
  // number re-triggers the whole line without any of them holding a timer that
  // a re-render could strand mid-flight.
  const [cycle, setCycle] = useState(0);

  // Word wrappers exist so a line still breaks between words: a run of
  // inline-block glyphs has a break opportunity between every pair, which
  // would let a narrow container split a word down the middle.
  const groups = useMemo(() => {
    const words = text.split(/(\s+)/).filter((part) => part.length > 0);
    let n = 0;
    return words.map((part) => {
      if (/^\s+$/.test(part)) return { space: true, bodies: [] as string[], at: [] as number[] };
      const bodies = split === "word" ? [part] : Array.from(part);
      const at = bodies.map(() => n++);
      return { space: false, bodies, at };
    });
  }, [text, split]);

  const replay = () => {
    if (trigger !== "hover" || halted) return;
    setCycle((n) => n + 1);
  };

  return (
    <div
      className={cn("select-none", className)}
      onPointerEnter={replay}
      onFocus={replay}
      tabIndex={trigger === "hover" ? 0 : undefined}
      // A hover trigger that only answers a mouse is half a component. Focus
      // covers the keyboard and pointerdown covers touch, where "enter" never
      // arrives on its own.
      onPointerDown={trigger === "hover" ? replay : undefined}
    >
      {/* The split rendering is hidden from assistive tech outright. A glyph
          per element makes a screen reader spell the line out, and Ctrl+F
          matches nothing across element boundaries — so the real sentence sits
          beside it as one uninterrupted string. */}
      <span aria-hidden>
        {groups.map((group, gi) =>
          group.space ? (
            <span key={gi}> </span>
          ) : (
            <span key={gi} className="inline-block">
              {group.bodies.map((body, bi) => (
                <Body
                  key={bi}
                  text={body}
                  index={group.at[bi]}
                  halted={halted}
                  cycle={cycle}
                  stiffness={stiffness}
                  damping={damping}
                  mass={mass}
                  jumpHeight={jumpHeight}
                  anticipation={anticipation}
                  windUp={windUp}
                  squash={squash}
                  stagger={stagger}
                  interval={interval}
                  repeat={trigger === "loop"}
                  shadow={shadow}
                  accentColor={accentColor}
                />
              ))}
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{text}</span>
    </div>
  );
}
