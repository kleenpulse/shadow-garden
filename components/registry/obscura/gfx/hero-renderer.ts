import { clock, effect, frame, frameLoop, sampler, surface } from "vgpu";
import type { Frame, FrameLoopHandle, Gpu, Surface } from "vgpu";

import { acquireGpu, releaseGpu } from "./gpu-context";
import { HERO_WGSL } from "./hero-shader";
import { loadTexture, type LoadedTexture } from "./load-texture";
import type { Rgb } from "../lib/token-colors";

// The hero's render loop, kept out of React — the component owns a canvas and
// a lifecycle, this closure owns the GPU (vgpu's own Next.js example splits
// the same way). One dispose(), called from one effect cleanup, stops the
// loop, releases the surface, destroys the photo texture and drops the shared
// device ref (SPEC §V69).
//
// The photograph arrives over the network AFTER the device is ready, so the
// loop only starts once both exist; until then the component's DOM <img>
// fallback is the hero, which makes the loading state and the no-WebGPU state
// the same designed thing (SPEC §V68).

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
  textureUrl: string,
  onFirstFrame?: () => void,
): HeroRendererHandle {
  let disposed = false;
  let released = false;
  let still = false;

  let canvasSurface: Surface | undefined;
  let photo: LoadedTexture | null = null;
  let loop: FrameLoopHandle | undefined;
  let renderOnce: (() => void) | undefined;
  let startLoop: (() => void) | undefined;

  const pointerTarget = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  let velocity = 0;
  let scroll = 0;
  let accent: Rgb = [0.827, 0.271, 0.169];
  let background: Rgb = [0.047, 0.039, 0.035];

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

    photo = await loadTexture(gpu, textureUrl);
    if (!photo || disposed) {
      // No photograph, no canvas — the DOM fallback stays the hero.
      photo?.destroy();
      photo = null;
      release();
      return;
    }

    canvasSurface = surface(gpu, canvas, { dpr: [1, 2], autoResize: true });
    const time = clock(gpu);
    const hero = effect(gpu, HERO_WGSL, {
      label: "obscura-hero",
      set: {
        photo_tex: photo.texture,
        photo_samp: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
      },
    });

    let firstFrame = true;
    const renderFrame = (f: Frame) => {
      const dx = pointerTarget.x - pointer.x;
      const dy = pointerTarget.y - pointer.y;
      pointer.x += dx * 0.06;
      pointer.y += dy * 0.06;
      // fringe widens while the pointer is in motion, settles as it rests
      velocity = velocity * 0.9 + Math.min(Math.hypot(dx, dy), 1) * 0.1;

      hero.set({
        params: {
          resolution: canvasSurface!.size,
          pointer: [pointer.x, pointer.y],
          accent,
          time: time.time,
          bg: background,
          scroll,
          velocity,
          tex_aspect: photo!.aspect,
        },
      });
      f.pass(canvasSurface!, hero);

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
      photo?.destroy();
      photo = null;
      release();
    },
  };
}
