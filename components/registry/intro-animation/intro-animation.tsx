"use client";

import { memo, useEffect, useMemo, useRef } from "react";

import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";
import {
  createDustGL,
  GRAIN_IN,
  hexToRgb01,
  sampleWord,
  type DustGL,
  type DustParams,
} from "./dust-gl";

/**
 * A wind front sweeps the wordmark right to left. The instant it reaches a
 * glyph the DOM text hands off to a baseline-aligned field of GPU grain — same
 * pixels, same colour, so there is no seam — and erosion proceeds per-grain:
 * grains hold at home, then peel off staggered (crown first) and drift away as
 * smoke. As the last char goes, the backdrop opens to reveal what is behind.
 *
 * One clock. The DOM handoff and the shader both derive the front from the same
 * sequence time, so the vanishing glyph and its grain field cannot desync — not
 * by convention, but because there is no second clock to disagree with.
 *
 * Mounting is the caller's: give it a positioned box (a `fixed inset-0` wrapper
 * for a page intro) and unmount on `onDone`. Session gating and scroll locking
 * are deliberately not in here — they are app policy, not animation.
 */

export interface IntroAnimationProps {
  /** The wordmark. Rendered one span per character. */
  text?: string;
  /** Seconds for the front to cross the wordmark. */
  sweepDuration?: number;
  /** Grains sampled per glyph. The performance knob. */
  grainDensity?: number;
  /** Multiplier on how hard the wind carries the dust downstream. */
  windSpeed?: number;
  /** Multiplier on how fast the plume climbs. */
  buoyancy?: number;
  /** Multiplier on the curl field that frays the plume into wisps. */
  turbulence?: number;
  /** Multiplier on individual grain size. */
  grainSize?: number;
  /** Characters before the accent colour takes over. */
  splitIndex?: number;
  /** How the backdrop leaves. `none` draws no backdrop at all. */
  reveal?: "split" | "fade" | "none";
  /** Replay on a loop. Off is the real thing: play once, then halt for good. */
  autoplay?: boolean;
  /** Seconds before the sequence restarts. Ignored unless `autoplay`. */
  replayDelay?: number;
  inkColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  /** Fires once per completed sequence. Unmount from here. */
  onDone?: () => void;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Beats after the sweep, in seconds. Tuned as a set — the plume needs airtime
 *  over the revealed page or the reveal reads as an edit rather than a clear. */
const SPLIT_DURATION = 0.9;
const FADE_DURATION = 0.85;
const PLUME_HOLD = 1.17; // reveal → canvas fade
const TAIL = 0.95; // canvas fade → finish
/** The backdrop opens just before the front clears the final chars, so the page
 *  is already arriving while the last letters are still coming apart. */
const REVEAL_RATIO = 0.937;
/** Front travel margins in px, so the first glyph is not already eroding on
 *  frame one and the last one is fully released before the sweep ends. */
const FRONT_LEAD = 40;
const FRONT_TAIL = 30;
/** How long the wordmark holds before `onDone` under reduced motion. */
const REDUCED_HOLD_MS = 900;
/** Target width of the wordmark as a share of the container, in cqw, before it
 *  is divided by the character count. Tuned against a bold uppercase face at
 *  roughly 0.68em average advance — 12 chars lands near 88% of the box. */
const FILL_CQW = 120;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** power2.inOut. */
const easeInOut = (p: number) =>
  p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;

interface WordMetrics {
  frontStart: number;
  wordLeft: number;
  rights: number[];
}

const IntroAnimation = memo(
  ({
    text = "SHADOWGARDEN",
    sweepDuration = 1.9,
    grainDensity = 2500,
    windSpeed = 1,
    buoyancy = 1,
    turbulence = 1,
    grainSize = 1,
    splitIndex = 6,
    reveal = "split",
    autoplay = true,
    replayDelay = 1.2,
    inkColor = "#e9e7ef",
    accentColor = "#a855f7",
    backgroundColor = "#08050e",
    onDone,
    paused = false,
    reducedMotion = false,
    className,
  }: IntroAnimationProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const charRefs = useRef<(HTMLSpanElement | null)[]>([]);

    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
      null,
    );

    const chars = useMemo(() => [...text], [text]);

    // Mirrored every render so the frame body reads live values. Nothing in
    // here rebuilds the GL context — every one of them is a uniform or a number
    // the frame recomputes, so a dragged control never re-rasterizes a glyph.
    const live = useRef({ sweepDuration, reveal, autoplay, replayDelay });
    live.current = { sweepDuration, reveal, autoplay, replayDelay };

    // Re-arms a finished sequence from outside the setup effect, so flipping
    // autoplay back on does not have to tear down the GL context to replay.
    const restartRef = useRef<(() => void) | null>(null);

    const params = useRef<DustParams>({
      wind: windSpeed,
      buoyancy,
      turbulence,
      grainSize,
      ink: hexToRgb01(inkColor),
      accent: hexToRgb01(accentColor),
    });
    params.current = {
      wind: windSpeed,
      buoyancy,
      turbulence,
      grainSize,
      ink: hexToRgb01(inkColor),
      accent: hexToRgb01(accentColor),
    };

    // Callback identity is the caller's business — an inline arrow must not
    // tear down a WebGL context every render.
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      // Re-sampling twelve glyphs is not a per-frame cost — coalesce the burst.
      resizeDebounceMs: 120,
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // A shorter word leaves the previous run's refs dangling past the end of
      // the array, and a stale span would keep being measured and hidden.
      charRefs.current.length = chars.length;

      // Reduced motion gets the wordmark, held and legible, and nothing else —
      // no context, no rasterization, no cost. The caller still gets its
      // completion signal so a real intro does not trap the page underneath it.
      if (reducedMotion) {
        for (const span of charRefs.current) {
          if (span) span.style.visibility = "visible";
        }
        const timer = setTimeout(() => onDoneRef.current?.(), REDUCED_HOLD_MS);
        return () => clearTimeout(timer);
      }

      let cancelled = false;
      let dust: DustGL | null = null;
      let word: WordMetrics | null = null;
      let time = 0;
      let done = false;
      let fontsReady = false;
      let glFailed = false;

      const measureWord = (): WordMetrics | null => {
        const origin = container.getBoundingClientRect();
        const rights: number[] = [];
        let left = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        for (const span of charRefs.current) {
          if (!span) {
            rights.push(Number.NEGATIVE_INFINITY);
            continue;
          }
          const box = span.getBoundingClientRect();
          rights.push(box.right - origin.left);
          if (box.width <= 0) continue;
          left = Math.min(left, box.left - origin.left);
          right = Math.max(right, box.right - origin.left);
        }
        if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
        return { frontStart: right + FRONT_LEAD, wordLeft: left, rights };
      };

      const resetCycle = () => {
        time = 0;
        done = false;
        for (const span of charRefs.current) {
          if (span) span.style.visibility = "visible";
        }
        if (topRef.current) {
          topRef.current.style.transform = "translateY(0%)";
          topRef.current.style.opacity = "1";
        }
        if (bottomRef.current) {
          bottomRef.current.style.transform = "translateY(0%)";
          bottomRef.current.style.opacity = "1";
        }
        if (dust) dust.canvas.style.opacity = "1";
      };
      restartRef.current = resetCycle;

      /**
       * Measure the wordmark, and build the GL surface the first time the box
       * is genuinely on screen. Returns false while it is not.
       *
       * Deliberately retryable rather than a one-shot build: a preview panel,
       * a collapsed accordion or a hidden tab can mount this at zero size, and
       * a build that gave up there would leave an empty box with nothing left
       * to trigger a second attempt. The ResizeObserver is that trigger.
       */
      const ensure = (): boolean => {
        // Grain positions are font-metric dependent: sampling before the face
        // has swapped rasterizes the fallback and the swap visibly jumps.
        if (!fontsReady) return false;
        const rect = container.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        const next = measureWord();
        if (!next) return false;
        word = next;
        if (dust || glFailed) return true;

        try {
          const grains = sampleWord(
            charRefs.current,
            rect,
            grainDensity,
            splitIndex,
          );
          if (grains.count === 0) return true;
          dust = createDustGL(container, grains, {
            width: rect.width,
            height: rect.height,
            dpr: Math.min(2, window.devicePixelRatio || 1),
            frontStart: word.frontStart,
            frontSpeed:
              (word.frontStart - (word.wordLeft - FRONT_TAIL)) /
              Math.max(0.1, live.current.sweepDuration),
            params: params.current,
          });
          glRef.current = dust.gl;
          // Warm-up draw while the wordmark still holds: absorbs pipeline
          // setup so the sweep's first frames do not hitch. Every grain is
          // pre-release at t=0, so nothing visible renders.
          dust.render(0);
        } catch {
          // No GL: the sequence still runs on schedule and the glyphs still go
          // as the front passes. Degraded, not broken — and not retried, since
          // a refused context does not start working on the next resize.
          glFailed = true;
          dust = null;
        }
        return true;
      };

      measureRef.current = (metrics) => {
        const existing = dust !== null;
        if (!ensure()) return;
        dust?.setSize(metrics.width, metrics.height, metrics.dpr);
        // The wordmark moved, so its grain field is stale. Re-sample rather
        // than let the cloud drift off the letters it came from. Skipped when
        // `ensure` just built, because that sampled at the new size already.
        if (existing) {
          const box = container.getBoundingClientRect();
          dust?.setGrains(
            sampleWord(charRefs.current, box, grainDensity, splitIndex),
          );
        }
      };

      drawRef.current = (dt) => {
          if (!word && !ensure()) return false;
          if (!word) return false;
          const {
            sweepDuration: sweep,
            reveal: mode,
            autoplay: loops,
            replayDelay: replay,
          } = live.current;

          time += dt;
          const t = time;

          // Recomputed here, every frame, from the live duration — this is the
          // single clock. The shader is handed the same two numbers, so the
          // glyph and its dust cannot disagree about where the front is.
          const sweepSeconds = Math.max(0.1, sweep);
          const frontSpeedNow =
            (word.frontStart - (word.wordLeft - FRONT_TAIL)) / sweepSeconds;
          dust?.setFront(word.frontStart, frontSpeedNow);
          dust?.setParams(params.current);

          const revealAt = sweepSeconds * REVEAL_RATIO;
          const canvasFadeAt = revealAt + PLUME_HOLD;
          const finishAt = canvasFadeAt + TAIL;

          // A glyph does not hide the moment the front touches it. Its grains
          // stipple in over GRAIN_IN seconds underneath the still-solid text —
          // same colour, same pixels, so the ramp is invisible — and only once
          // they are up does the span go. Hiding on contact is the robotic
          // crack: a whole letter switching to dust in one frame.
          const grainPx = frontSpeedNow * GRAIN_IN;
          const front = word.frontStart - frontSpeedNow * t;
          for (let i = 0; i < charRefs.current.length; i++) {
            const span = charRefs.current[i];
            if (!span) continue;
            if (
              front < word.rights[i] - grainPx &&
              span.style.visibility !== "hidden"
            ) {
              span.style.visibility = "hidden";
            }
          }

          if (mode !== "none") {
            const opened = easeInOut(clamp01((t - revealAt) / SPLIT_DURATION));
            const top = topRef.current;
            const bottom = bottomRef.current;
            if (top && bottom) {
              // Both channels written every frame: switching modes mid-cycle
              // would otherwise strand the backdrop translated or half-faded on
              // the channel the new mode never touches again.
              const shift = mode === "split" ? 100 * opened : 0;
              const held = mode === "split" ? "1" : String(1 - opened);
              top.style.transform = `translateY(${-shift}%)`;
              bottom.style.transform = `translateY(${shift}%)`;
              top.style.opacity = held;
              bottom.style.opacity = held;
            }
          }

          const fade = clamp01((t - canvasFadeAt) / FADE_DURATION);
          if (dust) dust.canvas.style.opacity = String(1 - fade * fade);

          dust?.render(t);

          if (t >= finishAt) {
            if (!done) {
              done = true;
              onDoneRef.current?.();
            }
            // Halting from inside the frame is the point of the `false` return:
            // a played-out intro must stop costing frames, not idle at zero.
            if (!loops || replay <= 0) return false;
            if (t >= finishAt + replay) resetCycle();
          }
      };

      void (async () => {
        try {
          await document.fonts.ready;
        } catch {
          /* no Font Loading API — measured metrics are already settled */
        }
        if (cancelled) return;
        fontsReady = true;
        ensure();
        loop.resize();
        loop.start();
      })();

      return () => {
        cancelled = true;
        drawRef.current = null;
        measureRef.current = null;
        restartRef.current = null;
        glRef.current = null;
        dust?.dispose();
        dust = null;
      };
      // `loop` is stable across renders; the props listed are the ones that
      // change the attribute buffers and therefore need a rebuild.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chars, grainDensity, splitIndex, reducedMotion, loop]);

    // Turning autoplay back on re-arms a sequence that already returned `false`
    // and stopped the loop. Nothing else can restart it: `halted` never moved,
    // so the hook has no reason to schedule another frame on its own.
    useEffect(() => {
      if (!autoplay) return;
      restartRef.current?.();
      loop.start();
    }, [autoplay, loop]);

    // A halted canvas still has to answer a dragged control: paint one frame so
    // colour and size changes land while paused or under reduced motion.
    useEffect(() => {
      loop.paint();
    }, [
      windSpeed,
      buoyancy,
      turbulence,
      grainSize,
      inkColor,
      accentColor,
      reveal,
      loop,
    ]);

    // With autoplay off the sequence halts for good on its last frame, which
    // leaves an empty box and no way back. The button is the trigger; it is not
    // rendered at all when the loop is already replaying on its own.
    const replay = () => {
      restartRef.current?.();
      loop.start();
    };

    const backdrop = reveal === "none" ? null : (
      <>
        <div
          ref={topRef}
          aria-hidden
          className="absolute inset-x-0 top-0"
          // +1px overlap: no subpixel seam at odd container heights.
          style={{ height: "calc(50% + 1px)", background: backgroundColor }}
        />
        <div
          ref={bottomRef}
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: backgroundColor }}
        />
      </>
    );

    return (
      <div
        ref={containerRef}
        role="img"
        aria-label={text}
        // A container query, not viewport units: this thing is as likely to be
        // a panel in a page as a full-bleed intro, and `vw` sizes the wordmark
        // to the window either way — which overflows every box smaller than it.
        className={[
          "@container relative size-full overflow-hidden",
          className ?? "",
        ].join(" ")}
      >
        {backdrop}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
        >
          <span
            className="font-sans font-bold whitespace-pre tracking-[0.02em]"
            // Scaled by character count as well as container width: a fixed
            // cqw would fit SHADOWGARDEN and overflow anything longer.
            style={{
              fontSize: `clamp(0.75rem, ${(FILL_CQW / Math.max(1, chars.length)).toFixed(2)}cqw, 7rem)`,
            }}
          >
            {chars.map((ch, i) => (
              <span
                key={i}
                ref={(el) => {
                  charRefs.current[i] = el;
                }}
                style={{ color: i < splitIndex ? inkColor : accentColor }}
              >
                {ch}
              </span>
            ))}
          </span>
        </div>
        {/* The dust canvas is appended here by dust-gl.ts — see the note on
            createDustGL for why it is not JSX. */}
        {!autoplay && !reducedMotion ? (
          <button
            type="button"
            onClick={replay}
            // z-10: the appended canvas is the container's last child, so
            // without it the button paints underneath the plume.
            className="absolute right-4 bottom-4 z-10 cursor-pointer rounded-full border px-4 py-1.5 text-[10px] tracking-[0.2em] uppercase opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
            // Coloured from the wordmark rather than a theme token: this sits
            // over the caller's backdrop, and there is no telling what that is.
            style={{
              color: inkColor,
              borderColor: `${inkColor}33`,
              outlineColor: accentColor,
            }}
          >
            Replay
          </button>
        ) : null}
      </div>
    );
  },
);

IntroAnimation.displayName = "IntroAnimation";

export default IntroAnimation;
