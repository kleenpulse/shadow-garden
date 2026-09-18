// The procedural world every surface in this template renders.
//
// The source used nine stock video files — four in the hero switcher, five in the
// bento grid — totalling around fifty megabytes. None of that footage was ours to
// redistribute, and a template that ships fifty megabytes of video is a template
// nobody can actually deploy.
//
// So the videos are gone and this is what replaced them: one fragment shader with
// a `uPreset` uniform. Nine "clips" are nine points in its parameter space, each a
// different palette and turbulence regime over the same domain-warped noise field.
// It weighs about four kilobytes, never buffers, resolves at whatever the display
// is, and loops forever without a seam.

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
// Palette and turbulence, packed into one 0..1 dial. Each "clip" is a value here.
uniform float uPreset;
// 0..1, driven by scroll where a surface wants to be scrubbed rather than looped.
uniform float uProgress;
// Global motion scale. Zero freezes the field without unmounting the context, so
// reduced motion keeps the image and loses only the movement.
uniform float uMotion;

// ── noise ───────────────────────────────────────────────────────────────────
// Value noise rather than gradient noise: one hash per lattice point instead of
// four, which matters when this runs on nine surfaces at once. The visual
// difference disappears entirely under the fbm below.

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic interpolant — smoother second derivative than smoothstep, which stops
  // the fbm showing lattice creases at low octave counts.
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, int octaves, float gain) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * noise(p);
    // Rotating between octaves breaks up the axis-aligned banding that stacked
    // value noise otherwise produces.
    p = rot * p * 2.02;
    amp *= gain;
  }
  return sum;
}

// ── palette ─────────────────────────────────────────────────────────────────
// Iñigo Quílez's cosine palette. Four vec3s describe an entire smooth ramp, so a
// preset is nine floats rather than a texture.
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);

  float t = uTime * uMotion;
  // The preset dial drives everything that distinguishes one clip from another.
  float regime = uPreset;
  float scale = mix(1.6, 4.2, regime);
  float warpAmount = mix(0.35, 1.15, fract(regime * 2.7));
  float gain = mix(0.42, 0.58, fract(regime * 1.9));
  float drift = mix(0.05, 0.16, fract(regime * 3.3));

  // Domain warping: sample the field at coordinates that are themselves displaced
  // by the field. This is what turns smooth noise into something that reads as
  // fluid rather than as fog.
  vec2 p = uv * scale + vec2(t * drift, t * drift * 0.6);
  vec2 q = vec2(fbm(p, 5, gain), fbm(p + vec2(5.2, 1.3), 5, gain));
  vec2 r = vec2(
    fbm(p + warpAmount * q + vec2(1.7, 9.2) + 0.15 * t, 5, gain),
    fbm(p + warpAmount * q + vec2(8.3, 2.8) - 0.12 * t, 5, gain)
  );
  float f = fbm(p + warpAmount * r, 5, gain);

  // Scrubbed surfaces push the field through the palette instead of looping it.
  float ramp = f * 0.5 + 0.5 + uProgress * 0.65;

  vec3 a = vec3(0.42, 0.36, 0.52);
  vec3 b = vec3(0.42, 0.34, 0.46);
  vec3 c = vec3(1.0, 0.95, 0.85) * mix(0.7, 1.35, regime);
  vec3 d = vec3(0.12, 0.28, 0.58) + vec3(regime * 0.45);

  vec3 col = palette(ramp, a, b, c, d);

  // Ridges pulled from the warp magnitude — the highlights that keep the field
  // from reading as a flat gradient.
  float ridge = pow(clamp(length(r) * 0.9, 0.0, 1.0), 2.2);
  col += ridge * mix(0.10, 0.34, regime);

  // Depth: darken the edges so text laid over this stays readable at any size.
  float vignette = smoothstep(1.45, 0.25, length(uv));
  col *= mix(0.55, 1.0, vignette);

  // Film grain, tied to time so it shimmers rather than sitting as a static
  // texture. Cheap, and it hides the banding an 8-bit framebuffer would show
  // across these very smooth ramps.
  float grain = hash22(gl_FragCoord.xy + fract(t) * 137.0).x * 0.035;
  col += grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/**
 * The nine "clips". Each is a point on the preset dial, named for where it is used
 * so the hero and the grid can ask for a mood rather than a number.
 */
export const PRESETS = {
  heroDawn: 0.06,
  heroDusk: 0.28,
  heroDeep: 0.52,
  heroEmber: 0.78,
  gridOne: 0.14,
  gridTwo: 0.36,
  gridThree: 0.61,
  gridFour: 0.84,
  gridFive: 0.95,
} as const;

export type PresetName = keyof typeof PRESETS;
