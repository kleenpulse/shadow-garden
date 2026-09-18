// Whether this browser can run the template's WebGPU layers.
//
// vgpu targets WebGPU only — there is no WebGL path to fall back to — so the
// canvases in gfx/ ask this ONCE before mounting a renderer, and render the CSS
// night-sky fallback instead when the answer is no. The probe requests a real
// adapter rather than only checking `navigator.gpu` exists: some browsers ship
// the API surface but return no adapter (software-only machines, forbidden
// contexts), and that case must land on the fallback too, not on a blank canvas.
//
// Typed structurally on purpose: naming `GPUAdapter` here would make the
// template's type-check depend on @webgpu/types being installed in the host
// project, and a paste-in template should not carry that requirement.

type NavigatorWithGpu = Navigator & {
  gpu?: { requestAdapter(): Promise<object | null> };
};

let probe: Promise<boolean> | null = null;

/** Resolves true when a WebGPU adapter is actually available. Memoized; SSR-safe (false). */
export function supportsWebGPU(): Promise<boolean> {
  if (typeof navigator === "undefined") return Promise.resolve(false);
  const gpu = (navigator as NavigatorWithGpu).gpu;
  if (!gpu) return Promise.resolve(false);
  probe ??= gpu
    .requestAdapter()
    .then((adapter) => adapter !== null)
    .catch(() => false);
  return probe;
}
