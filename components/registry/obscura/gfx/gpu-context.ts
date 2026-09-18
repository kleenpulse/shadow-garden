import { init } from "vgpu";
import type { Gpu } from "vgpu";

// One GPU device for the whole template.
//
// The hero and the starfield are separate canvases, but a GPUDevice is not a
// per-canvas resource — vgpu happily drives many surfaces from one `Gpu`, and
// browsers put a low ceiling on live devices. So the canvases share a single
// refcounted device: first mount creates it, last unmount disposes it. React
// strict mode makes this non-optional — every effect runs mount/unmount/mount
// in development, and a naive `init()` per canvas would leak a device per
// remount (SPEC §V69).

let gpuPromise: Promise<Gpu> | null = null;
let refs = 0;

/** Acquire the shared device. Pair every call with exactly one releaseGpu(). */
export function acquireGpu(): Promise<Gpu> {
  refs += 1;
  if (!gpuPromise) {
    gpuPromise = init().catch((error: unknown) => {
      // A failed init must not poison every later mount.
      gpuPromise = null;
      throw error;
    });
  }
  return gpuPromise;
}

/** Release one hold on the shared device; the last release disposes it. */
export function releaseGpu(): void {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && gpuPromise) {
    const pending = gpuPromise;
    gpuPromise = null;
    void pending
      .then((gpu) => gpu.dispose())
      .catch(() => {
        // Init failed — there is nothing to dispose.
      });
  }
}
