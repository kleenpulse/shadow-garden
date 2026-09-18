// WGSL for the work-gallery cards — inlined for the same reason as the hero
// shader (SPEC §V71). One pass per card, and the card's loop only runs while
// it is on screen and only spends effort while `hover` is above zero, so six
// of these cost less than one hero.
//
// Hover is a single 0..1 uniform eased on the CPU: it drives a ripple
// displacement radiating from the pointer, an RGB split in the ripple's wake,
// and a lift from the print's resting sepia-leaning grade to full color.

export const GALLERY_WGSL = /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  accent: vec3f,
  time: f32,
  hover: f32,
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

  // ripple radiating from the pointer while hovered
  let from_pointer = uv - params.pointer;
  let dist = length(from_pointer);
  let ripple = sin(dist * 34.0 - params.time * 5.0)
    * exp(-dist * 5.0)
    * params.hover * 0.012;
  let displaced = uv + normalize(from_pointer + vec2f(0.0001)) * ripple;

  let base = cover_uv(displaced, canvas_aspect, params.tex_aspect);

  // RGB split rides the ripple
  let split = vec2f(ripple * 2.4, 0.0);
  let r = textureSample(photo_tex, photo_samp, base + split).r;
  let g = textureSample(photo_tex, photo_samp, base).g;
  let b = textureSample(photo_tex, photo_samp, base - split).b;
  var color = vec3f(r, g, b);

  // resting state leans toward a cool archival grade; hover restores it
  let luma = dot(color, vec3f(0.299, 0.587, 0.114));
  let graded = mix(vec3f(luma) * vec3f(0.96, 0.98, 1.02), color, 0.35 + params.hover * 0.65);
  color = graded;

  // faint grain so the cards match the hero's material
  let grain = hash21(pos.xy + fract(params.time * 5.0) * 100.0) - 0.5;
  color = color + grain * 0.035;

  // hover brightens the print toward the accent very slightly at the edges
  let centered = uv - vec2f(0.5);
  let vignette = 1.0 - dot(centered, centered) * (0.55 - params.hover * 0.25);
  color = color * clamp(vignette, 0.0, 1.0);

  return vec4f(color, 1.0);
}
`;
