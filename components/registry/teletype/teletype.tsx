"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// A line of type arriving one character at a time, erased, replaced.
//
// The cadence is the whole component. A metronome at a fixed characters-per-
// second does not read as typing, it reads as a progress bar rendered in
// letters — so the rate varies per line, and the machine stops at punctuation
// the way a person does. Those two together are the difference between a
// typewriter and a countdown.
//
// The box is reserved before anything is typed. A headline that grows a
// character at a time re-wraps whatever sits beneath it on every frame, and
// that reflow is far more expensive and far more visible than the typing it is
// supposedly serving. `reserveSpace` is a prop rather than an assumption
// because turning it off is the fastest way to see why it is on.
export type TeletypeCaret = "block" | "bar" | "underscore" | "none";

export interface TeletypeProps {
  /** Typed in order; with `loop` on, the list wraps and keeps going. */
  lines?: string[];
  /** Typing rate before jitter, in characters per second. */
  charsPerSecond?: number;
  /** Erase rate as a multiple of the typing rate — deleting is never as
   *  deliberate as writing. */
  deleteRate?: number;
  /** Dwell on a finished line before it is taken away, in ms. */
  hold?: number;
  /** Empty beat between one line clearing and the next starting, in ms. */
  gap?: number;
  /** Spread on the per-line rate, 0 metronome to 1 wildly uneven. */
  jitter?: number;
  /** Extra beat after a comma, period, dash or colon, in ms. */
  punctuationPause?: number;
  /** Shape of the cursor trailing the text. */
  caret?: TeletypeCaret;
  /** Seconds per blink cycle. The caret holds steady while characters are
   *  actually arriving and only blinks once the line is at rest. */
  caretBlink?: number;
  /** Wrap to the first line when the list runs out. */
  loop?: boolean;
  /** Hold the box at the size of the longest line so nothing below it moves. */
  reserveSpace?: boolean;
  /** The caret. */
  accentColor?: string;
  /** Freeze mid-character. */
  paused?: boolean;
  /** Renders the first line landed and types nothing. The text is content, not
   *  decoration, so it is delivered rather than withheld. */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * Deterministic jitter. `Math.random()` would make every mount a different
 * performance, which is exactly wrong for a component whose cadence props are
 * meant to be judged by dragging a slider: you could never tell your change
 * apart from the noise.
 */
function makeRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/** Marks that earn an extra beat. An apostrophe does not — it sits inside a
 *  word, and pausing there reads as a stutter rather than as breath. */
const BREATH = new Set([",", ".", ";", ":", "!", "?", "—", "…"]);

type Phase = "type" | "punct" | "hold" | "delete" | "gap";

export default function Teletype({
  lines = [],
  charsPerSecond = 22,
  deleteRate = 2.4,
  hold = 1500,
  gap = 420,
  jitter = 0.45,
  punctuationPause = 220,
  caret = "block",
  caretBlink = 1.05,
  loop = true,
  reserveSpace = true,
  accentColor = "#a855f7",
  paused = false,
  reducedMotion = false,
  className,
}: TeletypeProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [chars, setChars] = useState(0);
  const [steady, setSteady] = useState(false);
  const [done, setDone] = useState(false);

  const halted = paused || reducedMotion;
  const text = lines[index] ?? "";

  // Live mirror. The frame body runs from inside the runtime host and would
  // otherwise close over the render that installed it, so every prop it reads
  // has to come through here.
  const live = useRef({
    lines,
    charsPerSecond,
    deleteRate,
    hold,
    gap,
    jitter,
    punctuationPause,
    loop,
    reducedMotion,
  });
  live.current = {
    lines,
    charsPerSecond,
    deleteRate,
    hold,
    gap,
    jitter,
    punctuationPause,
    loop,
    reducedMotion,
  };

  const fresh = () => ({
    index: 0,
    chars: 0,
    wait: 0,
    rate: 1,
    phase: "type" as Phase,
    /** Character index the last breath was taken at, so a long dwell on one
     *  comma does not re-trigger every frame it is still standing on. */
    breathAt: -1,
    random: makeRandom(0x7e1e),
  });

  const run = useRef(fresh());

  // §V34. A component that hides its own content behind an animation has to
  // hand that content over when the animation is refused — not run the same
  // animation at zero duration and call it honoured.
  useEffect(() => {
    if (!reducedMotion) return;
    setIndex(0);
    setChars(lines[0]?.length ?? 0);
    setSteady(true);
    setDone(true);
  }, [reducedMotion, lines]);

  // Restart whenever the source changes. The frame body halts itself by
  // returning false when a non-looping list runs dry, and a self-halt is
  // invisible to the host's own `halted` effect — nothing would re-arm it.
  useEffect(() => {
    if (reducedMotion) return;
    run.current = fresh();
    setIndex(0);
    setChars(0);
    setSteady(false);
    setDone(false);
    // `fresh` is a plain factory closing over nothing; listing it would fire
    // this effect every render and restart the line forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, reducedMotion]);

  // Turning `loop` back on after a finite list has run dry has to undo the
  // completion, or the re-arm below is permanently blocked by it.
  useEffect(() => {
    if (loop) setDone(false);
  }, [loop]);

  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  drawRef.current = (dt: number) => {
    const p = live.current;
    if (p.lines.length === 0) return false;
    // The host halts *after* drawing, so the frame already in flight when
    // reduced motion turns on still runs — and its `setChars` lands after the
    // effect that just delivered the whole line, clobbering it with whatever
    // fragment was on screen. Measured: switching the OS preference mid-word
    // left the line frozen at "I am t" for good. The frame body has to refuse
    // to write, not merely stop being scheduled.
    if (p.reducedMotion) return false;

    const s = run.current;
    const line = p.lines[s.index] ?? "";

    switch (s.phase) {
      case "type": {
        s.chars = Math.min(
          line.length,
          s.chars + p.charsPerSecond * s.rate * dt,
        );
        const landed = Math.floor(s.chars);
        setChars(landed);

        if (s.chars >= line.length) {
          s.wait = p.hold / 1000;
          s.phase = "hold";
          setSteady(true);
          return;
        }
        // The breath belongs *after* the mark, not before it — the pause a
        // reader hears at a comma is the silence that follows it.
        const last = line[landed - 1];
        if (landed > s.breathAt && last && BREATH.has(last)) {
          s.breathAt = landed;
          s.wait = p.punctuationPause / 1000;
          s.phase = "punct";
        }
        return;
      }

      case "punct": {
        s.wait -= dt;
        if (s.wait <= 0) s.phase = "type";
        return;
      }

      case "hold": {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (!p.loop && s.index >= p.lines.length - 1) {
          setDone(true);
          return false;
        }
        // deleteRate at or below zero is not "erase very slowly", it is "do
        // not erase" — the line is cut and the next one starts clean.
        if (p.deleteRate > 0) {
          s.phase = "delete";
          setSteady(false);
          return;
        }
        s.index = (s.index + 1) % p.lines.length;
        s.chars = 0;
        s.breathAt = -1;
        s.rate = Math.max(0.2, 1 + (s.random() * 2 - 1) * p.jitter);
        s.wait = p.gap / 1000;
        s.phase = "gap";
        setIndex(s.index);
        setChars(0);
        return;
      }

      case "delete": {
        s.chars = Math.max(
          0,
          s.chars - p.charsPerSecond * p.deleteRate * s.rate * dt,
        );
        setChars(Math.floor(s.chars));
        if (s.chars > 0) return;
        s.index = (s.index + 1) % p.lines.length;
        s.breathAt = -1;
        s.rate = Math.max(0.2, 1 + (s.random() * 2 - 1) * p.jitter);
        s.wait = p.gap / 1000;
        s.phase = "gap";
        setIndex(s.index);
        setSteady(true);
        return;
      }

      case "gap": {
        s.wait -= dt;
        if (s.wait <= 0) {
          s.phase = "type";
          setSteady(false);
        }
        return;
      }
    }
  };

  const runtime = useAnimationLoop({
    target: rootRef,
    halted,
    // Literal ternary, never `?? false`. `drawRef.current?.(dt) ?? false` reads
    // as a null-guard and is not one: a frame that draws successfully returns
    // undefined, `undefined ?? false` is false, and false is this host's halt
    // signal. That form froze nineteen entries after one frame each.
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  // Re-arm after a self-halt. `halted` has not changed, so the host's own
  // resume effect will not fire.
  useEffect(() => {
    if (!halted && !done) runtime.start();
  }, [halted, done, lines, loop, runtime]);

  const visible = text.slice(0, chars);
  const blinking = !halted && steady && caretBlink > 0;

  const caretBox =
    caret === "bar"
      ? "w-[2px] h-[1.1em] translate-y-[0.18em]"
      : caret === "underscore"
        ? "w-[0.62em] h-[2px] translate-y-[0.05em]"
        : "w-[0.5em] h-[1em] translate-y-[0.14em]";

  // Every line stacked in one grid cell, so the reservation is the widest line
  // by the tallest — not the sum, which is what a normal flow of four
  // invisible paragraphs would give you.
  const ghosts = useMemo(() => lines.slice(0, 24), [lines]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "grid w-full font-mono text-ink *:col-1 *:row-1",
        className,
      )}
    >
      {reserveSpace
        ? ghosts.map((line, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none invisible whitespace-pre-wrap select-none"
            >
              {line}
            </span>
          ))
        : null}

      {/* The animated node is hidden from assistive tech: a partial word is
          not information, and a reader re-announcing the same sentence once
          per character is unusable. The whole current line sits beside it. */}
      <p aria-hidden className="whitespace-pre-wrap">
        {visible}
        {caret === "none" ? null : (
          <motion.span
            className={cn("ml-px inline-block align-baseline", caretBox)}
            style={{ backgroundColor: accentColor }}
            animate={blinking ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
            transition={
              blinking
                ? { duration: caretBlink, repeat: Infinity, ease: "linear" }
                : { duration: 0 }
            }
          />
        )}
      </p>

      <span className="sr-only">{text}</span>
    </div>
  );
}
