import { clock, effect, frame, frameLoop, surface } from "vgpu";
import type { Frame, FrameLoopHandle, Gpu, Surface } from "vgpu";

import { acquireGpu, releaseGpu } from "./gpu-context";
import { STARFIELD_WGSL } from "./starfield-shader";
import type { Rgb } from "../lib/token-colors";

// The page-wide starfield. Same closure shape as the hero renderer — see the
// notes there — but a single fullscreen pass, capped at 24fps: stars twinkle
// slowly, and this canvas covers the whole viewport for the whole visit, so it
// is the one loop worth being stingy about. It shares the hero's GPU device
// through gpu-context (SPEC §V69).

export interface StarfieldRendererHandle {
  setPointer(x: number, y: number): void;
  /** Page scroll in viewport-heights, used for slow star parallax. */
  setScroll(progress: number): void;
  setColors(accent: Rgb, background: Rgb): void;
  setStill(still: boolean): void;
  dispose(): void;
}

export function startStarfieldRenderer(
  canvas: HTMLCanvasElement,
  onFirstFrame?: () => void,
): StarfieldRendererHandle {
  let disposed = false;
  let released = false;
  let still = false;

  let canvasSurface: Surface | undefined;
  let loop: FrameLoopHandle | undefined;
  let renderOnce: (() => void) | undefined;
  let startLoop: (() => void) | undefined;

  const pointerTarget = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  let scroll = 0;
  let accent: Rgb = [0.5, 0.83, 0.76];
  let background: Rgb = [0.02, 0.03, 0.06];

  const release = () => {
    if (released) return;
    released = true;
    releaseGpu();
  };

  void (async () => {
    let gpu: Gpu;
    try {
      gpu = await acquireGpu();
    } catch {
      release();
      return;
    }
    if (disposed) {
      release();
      return;
    }

    canvasSurface = surface(gpu, canvas, { dpr: [1, 2], autoResize: true });
    const time = clock(gpu);
    const stars = effect(gpu, STARFIELD_WGSL, { label: "aphelion-starfield" });

    let firstFrame = true;
    const renderFrame = (f: Frame) => {
      pointer.x += (pointerTarget.x - pointer.x) * 0.05;
      pointer.y += (pointerTarget.y - pointer.y) * 0.05;

      stars.set({
        params: {
          resolution: canvasSurface!.size,
          pointer: [pointer.x, pointer.y],
          accent,
          time: time.time,
          bg: background,
          scroll,
        },
      });
      f.pass(canvasSurface!, stars);

      if (firstFrame) {
        firstFrame = false;
        onFirstFrame?.();
      }
    };

    renderOnce = () => {
      if (disposed) return;
      frame(gpu, renderFrame);
    };
    startLoop = () => {
      if (disposed || loop) return;
      loop = frameLoop(gpu, renderFrame, { fps: 24 });
    };

    if (still) renderOnce();
    else startLoop();
  })();

  return {
    setPointer(x, y) {
      pointerTarget.x = x;
      pointerTarget.y = y;
    },
    setScroll(progress) {
      scroll = progress;
    },
    setColors(nextAccent, nextBackground) {
      accent = nextAccent;
      background = nextBackground;
      if (still) renderOnce?.();
    },
    setStill(next) {
      if (still === next) return;
      still = next;
      if (still) {
        loop?.stop();
        loop = undefined;
        renderOnce?.();
      } else {
        startLoop?.();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop?.stop();
      loop = undefined;
      canvasSurface?.dispose();
      canvasSurface = undefined;
      release();
    },
  };
}
