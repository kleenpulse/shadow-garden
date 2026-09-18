"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import Markers from "./markers";
import Playhead from "./playhead";
import Ruler from "./ruler";
import Transport from "./transport";
import { useTimeline } from "./use-timeline";
import { clamp, formatTimecode, snapToMarkers } from "./util";
import type { FollowMode, TimelineMarker } from "./types";

// A scrub-and-play timeline: drag the head, snap to markers, zoom into the
// track, and follow the playhead when it runs off the edge.
//
// One number is the whole component. `pxPerSecond` is derived from the measured
// viewport width, the duration and the zoom, and every position on screen — the
// ruler's ticks, the marker pips, the playhead, the drag target, the follow
// scroll — is that number times a time. Nothing measures anything separately,
// which is why a marker can never sit next to the wrong tick and the head can
// never land somewhere other than where you released it.
//
// The snap tolerance is specified in PIXELS and converted to seconds through the
// same factor. That is the point of it: what makes a snap feel right is how far
// your finger is from the target on screen, not how far the values are apart. A
// tolerance in seconds is generous when zoomed out and unusable when zoomed in,
// and has to be re-tuned every time the zoom changes.

const MAX_ZOOM = 40;

export interface TimelineScrubberProps {
  /** Points to snap to and jump between. */
  markers?: TimelineMarker[];
  className?: string;
  /** Total length in seconds. */
  duration?: number;
  /** Frames per second — drives the timecode and the step size. */
  fps?: number;
  /** Initial horizontal zoom. Ctrl/Cmd + wheel overrides it live. */
  zoom?: number;
  /** How close the pointer has to be to a marker to snap, in px. */
  snapThreshold?: number;
  /** Show the tick ruler above the lane. */
  showRuler?: boolean;
  /** Show marker pips over the lane. */
  showMarkers?: boolean;
  /** Wrap to the start on reaching the end instead of stopping. */
  loop?: boolean;
  /** Playback speed multiplier. */
  playbackRate?: number;
  /** What the viewport does when the playhead runs past its edge. */
  follow?: FollowMode;
  /** Height of the lane under the ruler, in px. */
  trackHeight?: number;
  /** Playhead, active transport and default marker colour. */
  accent?: string;
  /** Halt playback from outside — a page-level pause control. */
  paused?: boolean;
  /** Drop the playhead handle's grow-on-grab. Scrubbing itself is unaffected. */
  reducedMotion?: boolean;
  onTimeChange?: (time: number) => void;
}

export default function TimelineScrubber({
  markers = [],
  className,
  duration = 24,
  fps = 30,
  zoom = 1,
  snapThreshold = 10,
  showRuler = true,
  showMarkers = true,
  loop = true,
  playbackRate = 1,
  follow = "page",
  trackHeight = 72,
  accent = "#a855f7",
  paused = false,
  reducedMotion = false,
  onTimeChange,
}: TimelineScrubberProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Seeded from the prop and then owned locally, so the wheel can zoom without
  // the caller having to hold the value. Re-seeded when the prop changes, which
  // is what makes an external zoom control still work.
  //
  // Adjusted during render rather than in an effect. An effect would paint one
  // frame at the stale zoom before correcting it, and at high zoom that frame is
  // a visible jump in the ruler. React re-runs this component immediately
  // instead, before anything reaches the screen.
  const [zoomLevel, setZoomLevel] = useState(zoom);
  const [seededFrom, setSeededFrom] = useState(zoom);
  if (zoom !== seededFrom) {
    setSeededFrom(zoom);
    setZoomLevel(zoom);
  }

  const timeline = useTimeline({ duration, playbackRate, loop, paused });
  const { time, playing, width, viewportRef, seek, nudge, toggle } = timeline;

  const pxPerSecond = duration > 0 ? (width / duration) * zoomLevel : 0;
  // Floored, and only here. The measured width is fractional — a flex child in a
  // padded panel lands on 740.5px as often as not — and a content box set to
  // 740.5 inside a client box that reports 740 overflows by a rounded-up pixel,
  // which is a horizontal scrollbar permanently parked under a track that
  // visibly fits. `pxPerSecond` keeps its fraction, so every position on the
  // track is still exact; it is the container that has to land on a whole pixel.
  const contentWidth = Math.floor(duration * pxPerSecond);

  useEffect(() => onTimeChange?.(time), [time, onTimeChange]);

  const seekFromClientX = useCallback(
    (clientX: number, bypassSnap: boolean) => {
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect || pxPerSecond <= 0) return;
      const raw = (clientX - rect.left) / pxPerSecond;
      const snapped =
        bypassSnap || !showMarkers
          ? raw
          : snapToMarkers(raw, markers, snapThreshold / pxPerSecond);
      seek(snapped);
    },
    [markers, pxPerSecond, seek, showMarkers, snapThreshold],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    seekFromClientX(event.clientX, event.altKey);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    seekFromClientX(event.clientX, event.altKey);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  // ── Zoom about the cursor ────────────────────────────────────────────────
  // Two halves that have to agree: the wheel records which time was under the
  // cursor, and a layout effect puts that time back under it once the new
  // widths have been laid out. Setting scrollLeft in the handler itself would
  // read the pre-zoom content width and land somewhere else entirely.
  const anchor = useRef<{ time: number; offset: number } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Attached natively rather than through onWheel: React registers wheel
    // listeners as passive at the root, and a passive listener cannot
    // preventDefault — so the browser would zoom the whole page out from under
    // the component on every Ctrl+wheel.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const offset = event.clientX - rect.left;
      setZoomLevel((current) => {
        const next = clamp(
          current * Math.exp(-event.deltaY * 0.002),
          1,
          MAX_ZOOM,
        );
        if (next === current) return current;
        const factor =
          duration > 0 && width > 0 ? (width / duration) * current : 0;
        if (factor > 0) {
          anchor.current = {
            time: (viewport.scrollLeft + offset) / factor,
            offset,
          };
        }
        return next;
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [duration, viewportRef, width]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const pending = anchor.current;
    if (!viewport || !pending || pxPerSecond <= 0) return;
    anchor.current = null;
    viewport.scrollLeft = pending.time * pxPerSecond - pending.offset;
  }, [pxPerSecond, viewportRef]);

  // ── Follow ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !playing || follow === "off" || pxPerSecond <= 0) return;

    const head = time * pxPerSecond;
    if (follow === "center") {
      viewport.scrollLeft = head - viewport.clientWidth / 2;
      return;
    }
    // Page: only act when the head has actually left, and land it near the left
    // edge so a whole viewport of timeline is ahead of it rather than a sliver.
    const EDGE = 24;
    if (
      head > viewport.scrollLeft + viewport.clientWidth - EDGE ||
      head < viewport.scrollLeft
    ) {
      viewport.scrollLeft = head - EDGE;
    }
  }, [time, playing, follow, pxPerSecond, viewportRef]);

  const frame = 1 / Math.max(fps, 1);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-2xl border border-hairline bg-panel p-3",
        className,
      )}
    >
      <Transport
        playing={playing}
        timecode={formatTimecode(time, fps)}
        accent={accent}
        onToggle={toggle}
        onStart={() => seek(0)}
        onEnd={() => seek(duration)}
        onStepBack={() => nudge(-frame)}
        onStepForward={() => nudge(frame)}
      />

      {/* The border lives on this wrapper, never on the scroller itself. The
          runtime host measures with getBoundingClientRect, which is a border-box
          width — set the content to that on a bordered element and it overruns
          its own content box by exactly the two border widths, and zoom 1 ships
          with a permanent two-pixel scrollbar under a track that visibly fits. */}
      <div className="w-full overflow-hidden rounded-lg border border-hairline bg-surface focus-within:border-accent">
        <div
          ref={viewportRef}
          tabIndex={0}
          role="slider"
          aria-label="Timeline position"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Number(time.toFixed(2))}
          aria-valuetext={formatTimecode(time, fps)}
          className="relative w-full overflow-x-auto overscroll-x-contain outline-none"
          onKeyDown={(event) => {
            if (event.key === " ") {
              event.preventDefault();
              toggle();
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              seek(0);
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              seek(duration);
              return;
            }
            const back = event.key === "ArrowLeft";
            const forward = event.key === "ArrowRight";
            if (!back && !forward) return;
            event.preventDefault();
            // Shift is the coarse step. One frame is the right default for a
            // timeline — it is the smallest thing the timecode can express, so
            // any finer step would move the head without moving the readout.
            const stride = event.shiftKey ? 1 : frame;
            nudge(forward ? stride : -stride);
          }}
        >
          <div
            ref={contentRef}
            className="relative"
            style={{ width: contentWidth || "100%" }}
          >
            {showRuler ? (
              <Ruler
              duration={duration}
              fps={fps}
              pxPerSecond={pxPerSecond}
              width={contentWidth}
            />
            ) : null}

            <div
              className="relative cursor-crosshair"
              style={{ height: trackHeight }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {/* The lane's own banding. Sized off the same tick step the ruler
                uses, so the stripes line up with the labels instead of forming a
                second, competing grid. */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, color-mix(in oklab, var(--color-raised) 90%, transparent) 0 1px, transparent 1px ${Math.max(pxPerSecond, 1)}px)`,
                }}
              />
              <div
                aria-hidden
                className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-md border border-hairline bg-raised/60"
              />
              {showMarkers ? (
                <Markers
                  markers={markers}
                  pxPerSecond={pxPerSecond}
                  accent={accent}
                  onSeek={seek}
                />
              ) : null}
            </div>

            <Playhead
              x={time * pxPerSecond}
              accent={accent}
              dragging={dragging && !reducedMotion}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
