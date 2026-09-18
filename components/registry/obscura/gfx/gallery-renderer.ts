import { clock, effect, frame, frameLoop, sampler, surface } from "vgpu";
import type { Frame, FrameLoopHandle, Gpu, Surface } from "vgpu";

import { acquireGpu, releaseGpu } from "./gpu-context";
import { GALLERY_WGSL } from "./gallery-shader";
import { loadTexture, type LoadedTexture } from "./load-texture";
import type { Rgb } from "../lib/token-colors";

// One work-card's loop. Six of these mount at once, so each shares the
// template's single GPU device (gpu-context) and each is gated twice: the
// canvas component calls setActive(false) when the card leaves the viewport
// (IntersectionObserver), and `still` freezes it like every other loop
// (SPEC §V70). An inactive or still card costs nothing per frame.

export interface GalleryRendererHandle {
  /** Pointer inside the card, both axes 0..1. */
  setPointer(x: number, y: number): void;
  /** Eased toward inside the loop — 1 while the card is hovered. */
  setHover(hovered: boolean): void;
  /** Whether the card is on screen; off-screen cards stop their loop. */
  setActive(active: boolean): void;
  setColors(accent: Rgb): void;
  setStill(still: boolean): void;
  dispose(): void;
}

export function startGalleryRenderer(
  canvas: HTMLCanvasElement,
  textureUrl: string,
  onFirstFrame?: () => void,
): GalleryRendererHandle {
  let disposed = false;
  let released = false;
  let still = false;
  let active = true;

  let canvasSurface: Surface | undefined;
  let photo: LoadedTexture | null = null;
  let loop: FrameLoopHandle | undefined;
  let renderOnce: (() => void) | undefined;
  let syncLoop: (() => void) | undefined;

  const pointer = { x: 0.5, y: 0.5 };
  let hover = 0;
  let hoverTarget = 0;
  let accent: Rgb = [0.827, 0.271, 0.169];

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
      photo?.destroy();
      photo = null;
      release();
      return;
    }

    canvasSurface = surface(gpu, canvas, { dpr: [1, 2], autoResize: true });
    const time = clock(gpu);
    const card = effect(gpu, GALLERY_WGSL, {
      label: "obscura-gallery",
      set: {
        photo_tex: photo.texture,
        photo_samp: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
      },
    });

    let firstFrame = true;
    const renderFrame = (f: Frame) => {
      hover += (hoverTarget - hover) * 0.08;

      card.set({
        params: {
          resolution: canvasSurface!.size,
          pointer: [pointer.x, pointer.y],
          accent,
          time: time.time,
          hover,
          tex_aspect: photo!.aspect,
        },
      });
      f.pass(canvasSurface!, card);

      if (firstFrame) {
        firstFrame = false;
        onFirstFrame?.();
      }
    };

    renderOnce = () => {
      if (disposed) return;
      frame(gpu, renderFrame);
    };
    syncLoop = () => {
      const shouldRun = active && !still && !disposed;
      if (shouldRun && !loop) {
        loop = frameLoop(gpu, renderFrame, { fps: 30 });
      } else if (!shouldRun && loop) {
        loop.stop();
        loop = undefined;
      }
    };

    if (still || !active) renderOnce();
    syncLoop();
  })();

  return {
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
    },
    setHover(hovered) {
      hoverTarget = hovered ? 1 : 0;
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      syncLoop?.();
    },
    setColors(nextAccent) {
      accent = nextAccent;
      if (still) renderOnce?.();
    },
    setStill(next) {
      if (still === next) return;
      still = next;
      if (still) renderOnce?.();
      syncLoop?.();
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
