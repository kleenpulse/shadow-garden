"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { FieldRenderer } from "./field-renderer";
import { useStill } from "../hooks/use-still";

// The React surface for the field.
//
// Everything expensive about this component is in when it does NOT run:
//
//   · a ResizeObserver sizes the drawing buffer from the element's own box, so it
//     renders the pixels that are on screen and not however many the host viewport
//     implies;
//   · an IntersectionObserver stops the loop when the surface scrolls away — this
//     page mounts nine of these and at most two are ever visible;
//   · `visibilitychange` stops it when the tab is backgrounded, which the browser
//     does not reliably do for a WebGL loop on its own;
//   · reduced motion drops `uMotion` to zero rather than unmounting, so the image
//     stays and only the movement goes.
//
// A `<video>` had none of those properties. Nine of them decoded continuously
// whether or not anyone could see them.

export interface FieldCanvasProps
  extends React.HTMLAttributes<HTMLCanvasElement> {
  /** 0..1 dial. See PRESETS in field-shader.ts. */
  preset: number;
  /** 0..1, for scroll-scrubbed surfaces. Omit to loop on time. */
  progress?: number;
  className?: string;
}

// Ref-forwarding, because the tilt surfaces measure and transform the element
// directly — the field is what fills them, not what positions them.
const FieldCanvas = forwardRef<HTMLCanvasElement, FieldCanvasProps>(function
FieldCanvas({ preset, progress, className, ...rest }, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(forwardedRef, () => canvasRef.current!, []);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const still = useStill();

  // Live values the loop reads without being torn down and rebuilt for each one.
  const presetRef = useRef(preset);
  const progressRef = useRef(progress ?? 0);
  presetRef.current = preset;
  progressRef.current = progress ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: FieldRenderer;
    try {
      renderer = new FieldRenderer(canvas, { preset: presetRef.current });
    } catch {
      // No WebGL2. The CSS gradient underneath the canvas is the fallback, and it
      // is why the wrapper carries one.
      return;
    }
    if (!renderer.ready) return;
    rendererRef.current = renderer;

    let frame = 0;
    let onScreen = true;

    const draw = (now: number) => {
      renderer.set({
        preset: presetRef.current,
        progress: progressRef.current,
        motion: still ? 0 : 1,
      });
      renderer.render(now);
      frame = onScreen && !document.hidden ? requestAnimationFrame(draw) : 0;
    };

    const start = () => {
      if (!frame && onScreen && !document.hidden) {
        frame = requestAnimationFrame(draw);
      }
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (!rect) return;
      renderer.resize(rect.width, rect.height);
      // Repaint immediately: a resize while paused would otherwise leave the old
      // buffer stretched until something else woke the loop.
      renderer.render(performance.now());
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        if (onScreen) start();
        else stop();
      },
      { rootMargin: "150px" },
    );
    intersectionObserver.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.dispose();
      rendererRef.current = null;
    };
    // `still` is a dependency because a frozen field still needs one final frame
    // drawn at motion 0.
  }, [still]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      // Own compositor layer. A canvas that repaints every frame otherwise dirties
      // the page raster around it, which is ruinous for any host displaying this
      // page through a CSS transform.
      style={{ transform: "translateZ(0)", willChange: "transform" }}
      {...rest}
    />
  );
});

export default FieldCanvas;
