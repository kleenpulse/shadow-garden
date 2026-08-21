"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

export type StreamChunking = "word" | "character";
export type StreamCaret = "bar" | "block" | "none";

export interface StreamProps {
  /** The full response to stream. */
  text?: string;
  tokensPerSecond?: number;
  /** Cadence irregularity — bursts and stalls that make it read as a live
   *  model rather than a metronome. */
  jitter?: number;
  chunking?: StreamChunking;
  /** Blur each token arrives from, in CSS pixels. */
  blurAmount?: number;
  /** Shimmer "thinking" phase before the first token, in ms. */
  thinkingMs?: number;
  caret?: StreamCaret;
  caretColor?: string;
  /** Regenerate automatically after settling, so the demo loops hands-free. */
  autoReplay?: boolean;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

type Phase = "thinking" | "streaming" | "done" | "stopped";

/** Only the trailing window of tokens are live animated elements; everything
 *  older folds into one static text node, so a long answer never accumulates
 *  a thousand springs. */
const WINDOW = 24;

const DEFAULT_TEXT =
  "The registry is the single source of truth here: every tunable prop is declared once as a schema entry, and that one declaration drives both the controls panel you are reading and the props table below it. Nothing is documented twice, so nothing can drift. The code tab reads the shipped source straight from disk, strips the comments on the way out, and serves exactly what the copy button puts on your clipboard.";

const splitTokens = (text: string, chunking: StreamChunking): string[] => {
  if (chunking === "character") return Array.from(text);
  // words keep their trailing whitespace so the join is lossless
  return text.match(/\S+\s*/g) ?? [];
};

const Stream = ({
  text = DEFAULT_TEXT,
  tokensPerSecond = 18,
  jitter = 0.35,
  chunking = "word",
  blurAmount = 6,
  thinkingMs = 1200,
  caret = "bar",
  caretColor = "#a78bfa",
  autoReplay = true,
  paused = false,
  reducedMotion = false,
  className,
}: StreamProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const live = useRef({
    tokensPerSecond,
    jitter,
    blurAmount,
    thinkingMs,
    autoReplay,
    paused,
    reducedMotion,
  });
  live.current = {
    tokensPerSecond,
    jitter,
    blurAmount,
    thinkingMs,
    autoReplay,
    paused,
    reducedMotion,
  };

  const tokens = splitTokens(text, chunking);

  const [phase, setPhase] = useState<Phase>("thinking");
  const [count, setCount] = useState(0);

  // The clock lives here, not in React state: the frame body advances it and
  // commits at most one setState per frame.
  const clock = useRef({
    phase: "thinking" as Phase,
    count: 0,
    tokenTotal: tokens.length,
    thinkingLeft: thinkingMs / 1000,
    untilNext: 0,
    replayLeft: 0,
  });
  clock.current.tokenTotal = tokens.length;

  const loop = useAnimationLoop({
    target: containerRef,
    // Pausing the bench freezes generation mid-word — cadence rides the rAF
    // clock, never timer chains. Reduced motion strips decoration, not content.
    halted: paused,
    onFrame: ({ dt }) => {
      const c = clock.current;
      const L = live.current;

      if (c.phase === "thinking") {
        c.thinkingLeft -= dt;
        if (c.thinkingLeft <= 0) {
          c.phase = "streaming";
          c.untilNext = 0;
          setPhase("streaming");
        }
        return;
      }

      if (c.phase === "streaming") {
        c.untilNext -= dt;
        let emitted = 0;
        while (c.untilNext <= 0 && c.count < c.tokenTotal && emitted < 6) {
          c.count++;
          emitted++;
          const base = 1 / Math.max(L.tokensPerSecond, 0.5);
          const wobble = 1 + L.jitter * (Math.random() * 2 - 1);
          // occasional stall — the model "choosing its words"
          const stall =
            Math.random() < L.jitter * 0.05 ? base * (4 + Math.random() * 8) : 0;
          c.untilNext += base * Math.max(wobble, 0.25) + stall;
        }
        if (emitted > 0) setCount(c.count);
        if (c.count >= c.tokenTotal) {
          c.phase = "done";
          c.replayLeft = 2.6;
          setPhase("done");
        }
        return;
      }

      if (c.phase === "done" && L.autoReplay) {
        c.replayLeft -= dt;
        if (c.replayLeft <= 0) {
          c.phase = "thinking";
          c.count = 0;
          c.thinkingLeft = L.thinkingMs / 1000;
          setPhase("thinking");
          setCount(0);
        }
        return;
      }

      // done without replay, or stopped: nothing to advance — self-halt.
      return false;
    },
  });

  // Re-arm after a phase change flipped autoReplay back on, or on unpause.
  useEffect(() => {
    loop.start();
  }, [paused, autoReplay, loop]);

  // A new text or chunking resets the run — the old indices mean nothing.
  useEffect(() => {
    const c = clock.current;
    c.phase = "thinking";
    c.count = 0;
    c.thinkingLeft = live.current.thinkingMs / 1000;
    setPhase("thinking");
    setCount(0);
    loop.start();
  }, [text, chunking, loop]);

  const stop = () => {
    const c = clock.current;
    if (c.phase !== "streaming" && c.phase !== "thinking") return;
    c.phase = "stopped";
    setPhase("stopped");
  };

  const regenerate = () => {
    const c = clock.current;
    c.phase = "thinking";
    c.count = 0;
    c.thinkingLeft = live.current.thinkingMs / 1000;
    setPhase("thinking");
    setCount(0);
    loop.start();
  };

  const generating = phase === "thinking" || phase === "streaming";
  const windowStart = Math.max(0, count - WINDOW);
  const settledText = tokens.slice(0, windowStart).join("");
  const liveTokens = tokens.slice(windowStart, count);

  const caretEl =
    caret !== "none" && phase === "streaming" ? (
      <motion.span
        aria-hidden
        className="ml-px inline-block align-baseline"
        style={{
          width: caret === "block" ? "0.55em" : "2px",
          height: "1.1em",
          marginBottom: "-0.2em",
          background: caretColor,
        }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
        transition={
          reducedMotion
            ? undefined
            : { duration: 0.9, repeat: Infinity, ease: "linear" }
        }
      />
    ) : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full flex-col gap-4 rounded-lg border border-hairline bg-panel p-5",
        className,
      )}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Ghost of the full answer holds the final height, so neither the
            thinking→streaming swap nor the stream itself ever moves layout. */}
        <div
          aria-hidden
          className="invisible text-sm leading-relaxed"
        >
          {text}
        </div>

        {phase === "thinking" ? (
          <div className="absolute inset-0 flex flex-col gap-2.5 pt-1">
            {[0.92, 0.98, 0.62].map((w, i) => (
              <div
                key={i}
                className="relative h-3.5 overflow-hidden rounded bg-raised"
                style={{ width: `${w * 100}%` }}
              >
                {!reducedMotion && (
                  <motion.div
                    className="absolute inset-y-0 w-1/2"
                    style={{
                      background:
                        "linear-gradient(105deg, transparent, color-mix(in oklab, var(--sg-ink) 12%, transparent), transparent)",
                    }}
                    initial={{ x: "-110%" }}
                    animate={{ x: "310%" }}
                    transition={{
                      duration: 1.3,
                      repeat: Infinity,
                      ease: "linear",
                      delay: i * 0.18,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="absolute inset-0 overflow-hidden text-sm leading-relaxed text-ink">
            <span>{settledText}</span>
            {liveTokens.map((token, i) => (
              <motion.span
                key={windowStart + i}
                className="inline"
                initial={
                  reducedMotion
                    ? false
                    : { opacity: 0, y: 2, filter: `blur(${blurAmount}px)` }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {token}
              </motion.span>
            ))}
            {caretEl}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {generating ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 py-1.5 font-mono text-xs text-ink-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Square className="size-3" fill="currentColor" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={regenerate}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 py-1.5 font-mono text-xs text-ink-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <RotateCcw className="size-3" />
            Regenerate
          </button>
        )}
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">
          {phase === "thinking" && "thinking…"}
          {phase === "streaming" && `${count}/${tokens.length} tokens`}
          {phase === "done" && "complete"}
          {phase === "stopped" && "stopped"}
        </span>
      </div>
    </div>
  );
};

export default Stream;
