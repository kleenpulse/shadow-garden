// WGSL for the hero — inlined as a template literal on purpose (SPEC §V71):
// vgpu's effect() takes raw WGSL and generates the fullscreen vertex stage, so
// the shader ships without asking the buyer to configure a loader.
//
// One pass over the hero photograph, doing what the darkroom would: pointer
// parallax on the negative, chromatic fringing that grows toward the frame
// edge and with pointer speed, animated silver-halide grain, an accent-tinted
// light leak breathing along the top edge, and a printed-in vignette.

export const HERO_WGSL = /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  accent: vec3f,
  time: f32,
  bg: vec3f,
  scroll: f32,
  velocity: f32,
  tex_aspect: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var photo_tex: texture_2d<f32>;
@group(0) @binding(2) var photo_samp: sampler;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q = q + dot(q, q + 45.32);
  return fract(q.x * q.y);
}

// cover-fit: fill the canvas, crop the photo, never letterbox
fn cover_uv(uv: vec2f, canvas_aspect: f32, tex_aspect: f32) -> vec2f {
  var scaled = uv - vec2f(0.5);
  if (canvas_aspect > tex_aspect) {
    scaled.y = scaled.y * (tex_aspect / canvas_aspect);
  } else {
    scaled.x = scaled.x * (canvas_aspect / tex_aspect);
  }
  return scaled + vec2f(0.5);
}

@fragment
fn fs_main(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let canvas_aspect = params.resolution.x / max(params.resolution.y, 1.0);

  // parallax: the print drifts against the pointer, more at the edges
  let drift = params.pointer * vec2f(-0.014, -0.010);
  // scroll zooms in slightly as the hero leaves — a lens breathing out
  let zoom = 1.0 + params.scroll * 0.08;
  var base = (uv - vec2f(0.5)) / zoom + vec2f(0.5) + drift;
  base = cover_uv(base, canvas_aspect, params.tex_aspect);

  // chromatic fringe: radial, scaled by distance from centre and pointer speed
  let centered = uv - vec2f(0.5);
  let radial = length(centered);
  let fringe = centered * (0.0035 + radial * 0.004 + params.velocity * 0.010);

  let r = textureSample(photo_tex, photo_samp, base + fringe).r;
  let g = textureSample(photo_tex, photo_samp, base).g;
  let b = textureSample(photo_tex, photo_samp, base - fringe).b;
  var color = vec3f(r, g, b);

  // silver-halide grain, animated, stronger in the shadows
  let grain = hash21(pos.xy + fract(params.time * 7.0) * 100.0) - 0.5;
  let luma = dot(color, vec3f(0.299, 0.587, 0.114));
  color = color + grain * 0.055 * (1.0 - luma * 0.6);

  // accent light leak breathing along the top edge
  let leak_x = 0.5 + sin(params.time * 0.11) * 0.35 + params.pointer.x * 0.1;
  let leak = pow(max(1.0 - abs(uv.x - leak_x) * 1.6, 0.0), 2.0)
    * pow(max(1.0 - uv.y * 1.7, 0.0), 2.0)
    * (0.5 + 0.5 * sin(params.time * 0.23));
  color = color + params.accent * leak * 0.28;

  // printed-in vignette, deepened as the hero scrolls away
  let vignette = 1.0 - dot(centered, centered) * (0.75 + params.scroll * 0.9);
  color = color * clamp(vignette, 0.0, 1.0);
  color = mix(color, params.bg, params.scroll * 0.35);

  // dither against banding in the vignette falloff
  color = color + vec3f((hash21(pos.xy + 17.0) - 0.5) / 255.0);

  return vec4f(color, 1.0);
}
`;
