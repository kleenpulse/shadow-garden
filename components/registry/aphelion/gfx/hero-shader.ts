// WGSL for the hero — inlined as template literals on purpose (SPEC §V71).
//
// Shipping .wgsl files would force every buyer to configure a shader loader in
// their bundler before the template compiles. A string costs nothing: vgpu's
// effect() accepts raw WGSL, generates the fullscreen vertex stage when the
// source only has a fragment entry, and binds uniforms by variable name. The
// noise helpers are inlined below for the same reason — @vgpu/wgsl-std imports
// only exist for the loader path.
//
// Two passes. VOLUMETRIC_WGSL raymarches the aurora at half resolution — 24
// jittered slices through a curl of fbm noise is the whole trick, and at half
// res it stays cheap on integrated GPUs. COMPOSITE_WGSL upsamples that to the
// surface, then vignettes and dithers; the dither matters, because a slow
// aurora gradient over a #050810 sky bands visibly at 8 bits without it.

/** Half-res pass: aurora curtains, ridge silhouette, hero starfield. */
export const VOLUMETRIC_WGSL = /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  accent: vec3f,
  time: f32,
  bg: vec3f,
  scroll: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q = q + dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn noise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    value = value + amplitude * noise2(q);
    q = q * 2.03 + vec2f(17.1, 9.2);
    amplitude = amplitude * 0.5;
  }
  return value;
}

@fragment
fn fs_main(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  // sky runs 0 at the horizon line to 1 at the top of the frame
  let sky = 1.0 - uv.y;
  let x = (uv.x - 0.5) * aspect;

  var color = params.bg;

  // -- distant stars, dimmed where the aurora will sit --
  let cell = floor(vec2f(x, sky) * 220.0);
  let star = hash21(cell);
  if (star > 0.996) {
    let twinkle = 0.6 + 0.4 * sin(params.time * (1.0 + fract(star * 41.0) * 2.0) + star * 90.0);
    color = color + vec3f(0.8, 0.85, 1.0) * (star - 0.996) * 180.0 * twinkle * 0.35;
  }

  // -- aurora: 24 jittered curtain slices marching away from camera --
  let jitter = hash21(pos.xy * 0.7 + params.time);
  let drift = params.time * 0.035;
  let sway = params.pointer.x * 0.25;
  var aurora = vec3f(0.0);

  for (var i = 0; i < 24; i++) {
    let fi = f32(i) + jitter;
    let depth = 1.0 + fi * 0.28;
    let sample_pos = vec2f(
      x * depth * 0.9 + sway * (depth * 0.12) + drift,
      depth * 0.55 - params.time * 0.02
    );
    let curtain = fbm(sample_pos * vec2f(1.35, 0.5));

    // vertical envelope: curtains hang high, thin toward the horizon
    let lift = params.scroll * 0.35;
    let base = 0.22 + curtain * 0.25 + lift;
    let band = smoothstep(base, base + 0.5, sky) * smoothstep(1.25, 0.55 + lift, sky);

    let density = pow(max(curtain, 0.0), 2.4) * band / (1.0 + fi * 0.14);
    // hue drifts with height: accent low, a swizzled cousin of it high
    let high = params.accent.zxy * 0.75 + vec3f(0.06, 0.02, 0.12);
    let tint = mix(params.accent, high, min(fi / 24.0 + sky * 0.3, 1.0));
    aurora = aurora + tint * density;
  }

  color = color + aurora * (1.15 - params.scroll * 0.8);

  // -- faint airglow at the horizon --
  let glow = pow(max(1.0 - abs(sky - 0.12) * 4.0, 0.0), 2.0);
  color = color + params.accent * glow * 0.08;

  // -- ridge silhouette --
  let ridge = 0.10 + fbm(vec2f(x * 1.8 + 3.0, 7.0)) * 0.075;
  let ground = smoothstep(ridge, ridge - 0.012, sky);
  color = mix(color, params.bg * 0.35, ground);

  return vec4f(color, 1.0);
}
`;

/** Full-res pass: upsample the half-res aurora, vignette, dither. */
export const COMPOSITE_WGSL = /* wgsl */ `
struct Params {
  resolution: vec2f,
  time: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var vol_tex: texture_2d<f32>;
@group(0) @binding(2) var vol_samp: sampler;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q = q + dot(q, q + 45.32);
  return fract(q.x * q.y);
}

@fragment
fn fs_main(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  var color = textureSample(vol_tex, vol_samp, uv).rgb;

  // vignette — the frame should feel like looking up from inside a dome
  let centered = uv - vec2f(0.5, 0.42);
  let vignette = 1.0 - dot(centered, centered) * 0.85;
  color = color * clamp(vignette, 0.0, 1.0);

  // 1-bit blue-ish dither breaks the banding an 8-bit night gradient invites
  let dither = (hash21(pos.xy + fract(params.time)) - 0.5) / 255.0;
  color = color + vec3f(dither);

  return vec4f(color, 1.0);
}
`;
