"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { clamp } from "./util";

/**
 * The clock and the measurement, in one place.
 *
 * Both come off the shared animation runtime host, which is the reason this hook
 * exists rather than being three effects inside the component. The host already
 * owns exactly the two things a timeline needs and nothing else: a frame loop it
 * arms and halts on one boolean, and a ResizeObserver on a target element whose
 * width is re-reported on every resize. Running a second observer beside it to
 * measure the same element would be a second source of truth for the same
 * number.
 *
 * Honest tradeoff: `time` is React state, updated on every frame during
 * playback, so the subtree re-renders sixty times a second. The alternative is
 * to keep it in a ref and imperatively write the playhead transform, the
 * timecode text and the follow-scroll from inside the frame callback. That is
 * measurably cheaper and it is three separate write paths that can disagree
 * about what time it is — which is precisely the bug class a scrubber cannot
 * afford. At this subtree size the state update is not the expensive part;
 * correctness is worth more than the frames it costs.
 */

export interface UseTimelineOptions {
  /** Total length in seconds. */
  duration: number;
  /** Playback speed multiplier. */
  playbackRate: number;
  /** Wrap to the start on reaching the end instead of stopping there. */
  loop: boolean;
  /** Externally halted — the page's pause control, or reduced motion. */
  paused: boolean;
}

export interface Timeline {
  /** Current position in seconds. */
  time: number;
  playing: boolean;
  /** Measured viewport width in CSS px. 0 until first layout. */
  width: number;
  /** Attach to the element whose width defines the visible track. */
  viewportRef: RefObject<HTMLDivElement | null>;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Jump to an absolute time; clamped to the duration. */
  seek(time: number): void;
  /** Move by a relative amount, in seconds. */
  nudge(delta: number): void;
}

export function useTimeline(options: UseTimelineOptions): Timeline {
  const viewportRef = useRef<HTMLDivElement>(null);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(0);

  // The frame body must read the current options without the loop being rebuilt
  // every time one of them changes — dragging the rate slider would otherwise
  // restart the clock on every step. Mirrored in a layout effect rather than
  // during render: a ref written during render is wrong under a re-render React
  // throws away, and the runtime host itself keeps its options the same way.
  const live = useRef(options);
  useLayoutEffect(() => {
    live.current = options;
  });

  // The authoritative position. State follows it rather than the other way
  // round, so a seek mid-frame cannot be overwritten by the frame that was
  // already in flight.
  const timeRef = useRef(0);

  const seek = useCallback((next: number) => {
    const clamped = clamp(next, 0, live.current.duration);
    timeRef.current = clamped;
    setTime(clamped);
  }, []);

  useAnimationLoop({
    target: viewportRef,
    halted: !playing || options.paused,
    onResize: ({ width: measured }) => setWidth(measured),
    onFrame: ({ dt }) => {
      const { duration, playbackRate, loop } = live.current;
      const next = timeRef.current + dt * playbackRate;

      if (next < duration) {
        timeRef.current = next;
        setTime(next);
        return;
      }

      if (loop) {
        // Modulo, not reset-to-zero: at high rates a frame can carry the clock
        // well past the end, and throwing that overshoot away makes a looping
        // timeline run slightly slow.
        const wrapped = duration > 0 ? next % duration : 0;
        timeRef.current = wrapped;
        setTime(wrapped);
        return;
      }

      timeRef.current = duration;
      setTime(duration);
      setPlaying(false);
      // Literally `false`, which is the host's halt signal. Anything nullish
      // here would halt after the first successful frame instead.
      return false;
    },
  });

  const play = useCallback(() => {
    // Pressing play at the very end restarts rather than doing nothing, which is
    // what every transport does and what the button appears to promise.
    if (timeRef.current >= live.current.duration) seek(0);
    setPlaying(true);
  }, [seek]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const nudge = useCallback((delta: number) => seek(timeRef.current + delta), [seek]);

  return { time, playing, width, viewportRef, play, pause, toggle, seek, nudge };
}
