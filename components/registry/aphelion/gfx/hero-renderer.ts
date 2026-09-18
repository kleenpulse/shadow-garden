import { clock, effect, frame, frameLoop, sampler, surface, target } from "vgpu";
import type { Frame, FrameLoopHandle, Gpu, Surface, Target } from "vgpu";

import { acquireGpu, releaseGpu } from "./gpu-context";
import { COMPOSITE_WGSL, VOLUMETRIC_WGSL } from "./hero-shader";
import type { Rgb } from "../lib/token-colors";

// The hero's render loop, kept out of React on purpose. The component owns a
// canvas and a lifecycle; this closure owns the GPU. That split is the vgpu
// house pattern (its nextjs-flare example does the same) and it is what makes
// the teardown story auditable: one dispose(), called from one effect cleanup,
// stops the loop, releases the surface and drops the shared device ref
// (SPEC §V69).
//
// Two passes per frame: the aurora marches at HALF resolution into an
// offscreen target — raymarching is per-pixel expensive and a night sky is
// low-frequency, so nobody can tell — and the composite pass upsamples,
// vignettes and dithers at full resolution, capped at 30fps.

export interface HeroRendererHandle {
  /** Pointer in the hero's space, both axes -1..1. Eased inside the loop. */
  setPointer(x: number, y: number): void;
  /** How far the hero has scrolled out of view, 0..1. */
  setScroll(progress: number): void;
  setColors(accent: Rgb, background: Rgb): void;
  /** true → draw exactly one resting frame, then stop the loop (SPEC §V70). */
  setStill(still: boolean): void;
  dispose(): void;
}

export function startHeroRenderer(
  canvas: HTMLCanvasElement,
  onFirstFrame?: () => void,
): HeroRendererHandle {
  let disposed = false;
  let released = false;
  let still = false;

  let canvasSurface: Surface | undefined;
  let volTarget: Target | undefined;
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
      // No device — the canvas component keeps its CSS fallback visible.
      release();
      return;
    }
    if (disposed) {
      release();
      return;
    }

    canvasSurface = surface(gpu, canvas, { dpr: [1, 2], autoResize: true });

    const half = (): readonly [number, number] => [
      Math.max(1, Math.floor(canvasSurface!.size[0] / 2)),
      Math.max(1, Math.floor(canvasSurface!.size[1] / 2)),
    ];
    volTarget = target(gpu, { size: half() });
    canvasSurface.onResize(() => volTarget?.resize(half()));

    const time = clock(gpu);
    const volumetric = effect(gpu, VOLUMETRIC_WGSL, { label: "aphelion-volumetric" });
    const composite = effect(gpu, COMPOSITE_WGSL, {
      label: "aphelion-composite",
      set: {
        vol_tex: volTarget,
        vol_samp: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
      },
    });

    let firstFrame = true;
    const renderFrame = (f: Frame) => {
      // ease the pointer so the aurora sways instead of snapping
      pointer.x += (pointerTarget.x - pointer.x) * 0.06;
      pointer.y += (pointerTarget.y - pointer.y) * 0.06;

      volumetric.set({
        params: {
          resolution: volTarget!.size,
          pointer: [pointer.x, pointer.y],
          accent,
          time: time.time,
          bg: background,
          scroll,
        },
      });
      composite.set({
        params: { resolution: canvasSurface!.size, time: time.time },
      });

      f.pass(volTarget!, volumetric);
      f.pass(canvasSurface!, composite);

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
      loop = frameLoop(gpu, renderFrame, { fps: 30 });
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
      // a paused hero should still show the new brand immediately
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
