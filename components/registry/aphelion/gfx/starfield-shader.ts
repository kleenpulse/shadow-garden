// WGSL for the fixed page-wide starfield — inlined for the same reasons as the
// hero shaders (SPEC §V71): a string ships without loader configuration.
//
// One fullscreen pass, entirely procedural. Two hash-grid star layers at
// different scales give parallax against pointer and scroll; a low band of fbm
// haze across the diagonal reads as the Milky Way without costing a texture.
// This canvas IS the page background — it paints the --background token as its
// clear color, and the sections above it leave their own backgrounds
// transparent so the sky shows through everywhere.

export const STARFIELD_WGSL = /* wgsl */ `
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
  for (var i = 0; i < 3; i++) {
    value = value + amplitude * noise2(q);
    q = q * 2.11 + vec2f(11.3, 5.7);
    amplitude = amplitude * 0.5;
  }
  return value;
}

fn star_layer(p: vec2f, cells: f32, threshold: f32, time: f32) -> f32 {
  let grid = p * cells;
  let cell = floor(grid);
  let seed = hash21(cell);
  if (seed < threshold) { return 0.0; }
  // star sits somewhere inside its cell, not on the lattice
  let center = vec2f(hash21(cell + 7.1), hash21(cell + 13.7));
  let d = length(fract(grid) - center);
  let twinkle = 0.55 + 0.45 * sin(time * (0.8 + seed * 2.4) + seed * 80.0);
  let core = smoothstep(0.08, 0.0, d);
  return core * (seed - threshold) / (1.0 - threshold) * twinkle;
}

@fragment
fn fs_main(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  let p = vec2f((uv.x - 0.5) * aspect, uv.y);

  var color = params.bg;

  // Milky Way haze along a slow diagonal, tinted faintly toward the accent
  let axis = p.x * 0.55 + uv.y * 0.9 + params.scroll * 0.25;
  let haze = pow(fbm(p * 2.2 + vec2f(0.0, params.scroll * 0.6)), 2.0)
    * pow(max(1.0 - abs(axis - 0.75) * 1.6, 0.0), 2.0);
  color = color + mix(vec3f(0.5, 0.55, 0.7), params.accent, 0.25) * haze * 0.16;

  // two parallax layers: far (dense, dim) and near (sparse, bright)
  let far_offset = params.pointer * 0.008 + vec2f(0.0, params.scroll * 0.05);
  let near_offset = params.pointer * 0.02 + vec2f(0.0, params.scroll * 0.12);
  let far = star_layer(p + far_offset, 160.0, 0.985, params.time);
  let near = star_layer(p + near_offset, 70.0, 0.993, params.time);

  color = color + vec3f(0.75, 0.8, 0.95) * far * 0.5;
  color = color + vec3f(0.9, 0.93, 1.0) * near * 0.9;

  // dither against banding in the haze gradient
  let dither = (hash21(pos.xy + fract(params.time)) - 0.5) / 255.0;
  color = color + vec3f(dither);

  return vec4f(color, 1.0);
}
`;
