"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

/**
 * The animation runtime host: rAF arm/halt, ResizeObserver, devicePixelRatio,
 * resize debounce and teardown. The animation *body* — shader, physics, particle
 * math, draw calls — stays in the component (SPEC §C1/§C1a).
 *
 * It never names `paused` or `reducedMotion`. Callers own the decision and pass
 * one boolean, because the halt predicate genuinely varies across entries:
 *
 *   halted: paused                          // most loopers
 *   halted: paused || reducedMotion         // loopers that also quiesce on OS pref
 *   halted: speed <= 0                      // LightRays halts on its own speed
 *   halted: false + onFrame returns false    // decide inside the frame
 *
 * What it guarantees, which is exactly where the hand-rolled copies diverged:
 *   - at most one live rAF, ever (SPEC §V.V11)
 *   - a resize repaints at least one frame even while halted (§V.V2) — the loop
 *     runs one frame, then self-halts again
 *   - the ResizeObserver watches the container, never `window` (§V.V1)
 *   - devicePixelRatio is re-read on every resize, not captured once at init
 *   - after unmount nothing re-arms: a latch is checked *inside* the callback,
 *     because cancelAnimationFrame cannot stop a frame requested from an
 *     img.onload or a setTimeout that fires later
 *   - the debounce timer is owned here, so it cannot be left uncleared
 *   - dispose runs once and, when `gl` is supplied, drops the GL context
 *
 * Options live in a ref and the setup effect depends on `deps` (default `[]`),
 * so passing an inline object does not tear down and rebuild the runtime on
 * every parent render.
 */

export interface Metrics {
  /** CSS pixels. */
  width: number;
  height: number;
  /** The dpr actually applied, after the cap. */
  dpr: number;
  /** Backing-store pixels — width * dpr, rounded. */
  bufferWidth: number;
  bufferHeight: number;
}

export interface FrameInfo {
  /** performance.now() for this frame. */
  now: number;
  /** Seconds since the previous frame, clamped to avoid tab-restore jumps. */
  dt: number;
  /** Seconds since the loop first started. */
  elapsed: number;
  /** Frame counter since mount. */
  frame: number;
}

export interface AnimationLoopHandle {
  /** Begin or resume. No-op if disposed, or if a frame is already scheduled. */
  start(): void;
  /** Stop and cancel any pending frame. */
  stop(): void;
  /** Render exactly one frame now, even while halted. */
  paint(): void;
  /** Re-measure and repaint. Normally the ResizeObserver's job. */
  resize(): void;
  /** Whether a frame is currently scheduled. */
  readonly running: boolean;
}

export interface AnimationLoopOptions {
  /** Element to observe and measure. The RO watches this, never `window`. */
  target: React.RefObject<HTMLElement | null>;
  /** True while the loop should not run freely. Recomputed every render. */
  halted?: boolean;
  /**
   * devicePixelRatio **cap**, not a literal dpr. `"auto"` caps at 2.
   * Re-read on every resize, so moving between monitors stays sharp.
   */
  dpr?: number | "auto";
  /** Apply new dimensions: renderer.setSize, resolution uniforms, canvas.width. */
  onResize?(metrics: Metrics): void;
  /**
   * Draw one frame.
   *
   * Return **literally `false`** to halt from inside the body. Returning nothing
   * means "keep going" — which is what a function that just drew a frame does.
   *
   * Mind the difference when the draw call is behind a ref. This looks like a
   * null-guard and is a freeze, because a successful frame returns `undefined`
   * and `undefined ?? false` is `false`:
   *
   *     onFrame: ({ dt }) => drawRef.current?.(dt) ?? false        // ✗ one frame, then stops
   *     onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false)   // ✓
   */
  onFrame?(info: FrameInfo): void | false;
  /** Repaint once after a resize even while halted. Default true (§V.V2). */
  paintWhenHalted?: boolean;
  /** Coalesce resize bursts. Default 0 (none). The timer is cleared on unmount. */
  resizeDebounceMs?: number;
  /** Supply the GL context to lose on dispose. */
  gl?(): WebGLRenderingContext | WebGL2RenderingContext | null | undefined;
  /** Release caller-owned resources. Runs exactly once, before the context is lost. */
  onDispose?(): void;
  /** Rebuild the runtime when these change. Default `[]`. */
  deps?: unknown[];
}

/** Longest dt handed to a frame — a backgrounded tab must not jump the sim. */
const MAX_DT = 1 / 15;

export function useAnimationLoop(
  options: AnimationLoopOptions,
): AnimationLoopHandle {
  const opts = useRef(options);
  // Layout effect, not an assignment during render: the loop only reads this
  // from callbacks that run after commit.
  useLayoutEffect(() => {
    opts.current = options;
  });

  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const disposed = useRef(false);
  const startedAt = useRef(0);
  const last = useRef(0);
  const frame = useRef(0);

  const measure = useCallback((): Metrics | null => {
    const el = opts.current.target.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cap = opts.current.dpr ?? "auto";
    const limit = cap === "auto" ? 2 : cap;
    const dpr = Math.min(
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      limit,
    );
    return {
      width: rect.width,
      height: rect.height,
      dpr,
      bufferWidth: Math.max(1, Math.round(rect.width * dpr)),
      bufferHeight: Math.max(1, Math.round(rect.height * dpr)),
    };
  }, []);

  // Named function expression so the recursive schedule refers to the function
  // itself rather than reaching back out to the binding.
  const tick = useCallback(function tick(now: number) {
    // The latch, checked here rather than only at cancel time: a frame requested
    // from an image load or a timer can land after unmount.
    if (disposed.current) return;

    if (startedAt.current === 0) startedAt.current = now;
    const dt = last.current === 0 ? 0 : Math.min((now - last.current) / 1000, MAX_DT);
    last.current = now;

    const info: FrameInfo = {
      now,
      dt,
      elapsed: (now - startedAt.current) / 1000,
      frame: frame.current++,
    };

    const verdict = opts.current.onFrame?.(info);

    if (disposed.current) return;

    // Halt *after* drawing, so a resize while halted still leaves a painted
    // frame on screen instead of a cleared buffer (§V.V2).
    if (verdict === false || opts.current.halted) {
      running.current = false;
      raf.current = null;
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    if (disposed.current || running.current) return;
    running.current = true;
    last.current = 0; // no dt spike across a pause
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = useCallback(() => {
    running.current = false;
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  // One frame, then tick's own halt check stops it again if still halted.
  const paint = useCallback(() => start(), [start]);

  const resize = useCallback(() => {
    const metrics = measure();
    if (!metrics) return;
    opts.current.onResize?.(metrics);
    if (opts.current.paintWhenHalted !== false) paint();
    else if (!opts.current.halted) start();
  }, [measure, paint, start]);

  const deps = options.deps ?? [];

  useEffect(() => {
    disposed.current = false;
    const el = opts.current.target.current;
    if (!el) return;

    const run = () => {
      if (disposed.current) return;
      resize();
    };

    const observer = new ResizeObserver(() => {
      const wait = opts.current.resizeDebounceMs ?? 0;
      if (wait <= 0) {
        run();
        return;
      }
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        run();
      }, wait);
    });
    observer.observe(el);

    // Initial measure, then start unless the caller is already halted — in
    // which case resize()'s repaint has still put one frame on screen.
    resize();
    if (!opts.current.halted) start();

    return () => {
      disposed.current = true;
      running.current = false;
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      observer.disconnect();
      opts.current.onDispose?.();
      const context = opts.current.gl?.();
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      startedAt.current = 0;
      last.current = 0;
      frame.current = 0;
    };
    // Intentionally not reacting to the options object: it is held in a ref so an
    // inline literal cannot rebuild the runtime every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Resume when the caller un-halts. Halting needs no action — the running
  // frame reads `halted` from the ref and stops itself after drawing.
  const halted = options.halted ?? false;
  useEffect(() => {
    if (!halted) start();
  }, [halted, start]);

  // `running` is read through a getter so callers see live state without the
  // handle itself changing identity between renders.
  return useMemo<AnimationLoopHandle>(
    () => ({
      start,
      stop,
      paint,
      resize,
      get running() {
        return running.current;
      },
    }),
    [start, stop, paint, resize],
  );
}
