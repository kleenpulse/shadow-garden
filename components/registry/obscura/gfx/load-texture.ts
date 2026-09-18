import type { Gpu } from "vgpu";

// Fetch a photograph and upload it to the GPU.
//
// vgpu (0.3.x) has no image-texture helper yet, so this file talks to the raw
// device: fetch → ImageBitmap → createTexture → copyExternalImageToTexture.
// The resulting texture object goes straight into an effect's `set` bag —
// vgpu binds anything with a createView(), which a GPUTexture has.
//
// Typed structurally on purpose: naming GPUTexture / GPUTextureUsage here
// would make the template's type-check depend on @webgpu/types existing in
// the host project. The numeric usage flags below are the WebGPU spec
// constants (COPY_DST 2 | TEXTURE_BINDING 4 | RENDER_ATTACHMENT 16 — the
// spec requires all three for external-image copies).
//
// Failure is a null, never a throw (SPEC §V68 in spirit): a missing image, a
// blocked fetch or a decode error must degrade to the DOM fallback the canvas
// keeps underneath, not blank the hero.

export interface LoadedTexture {
  texture: { createView(): unknown; destroy(): void };
  width: number;
  height: number;
  /** width / height, for cover-fit UV math in the shaders. */
  aspect: number;
  destroy(): void;
}

type DeviceLike = {
  createTexture(descriptor: {
    label?: string;
    size: { width: number; height: number };
    format: string;
    usage: number;
  }): LoadedTexture["texture"];
  queue: {
    copyExternalImageToTexture(
      source: { source: ImageBitmap },
      destination: { texture: LoadedTexture["texture"] },
      copySize: { width: number; height: number },
    ): void;
  };
};

const USAGE_COPY_DST_TEXTURE_BINDING_RENDER_ATTACHMENT = 2 | 4 | 16;

export async function loadTexture(
  gpu: Gpu,
  url: string,
): Promise<LoadedTexture | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());

    if (gpu.disposed) {
      bitmap.close();
      return null;
    }

    const device = gpu.gpu as unknown as DeviceLike;
    const size = { width: bitmap.width, height: bitmap.height };
    const texture = device.createTexture({
      label: "obscura-photo",
      size,
      format: "rgba8unorm",
      usage: USAGE_COPY_DST_TEXTURE_BINDING_RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      size,
    );
    bitmap.close();

    return {
      texture,
      width: size.width,
      height: size.height,
      aspect: size.width / Math.max(size.height, 1),
      destroy: () => texture.destroy(),
    };
  } catch {
    return null;
  }
}
