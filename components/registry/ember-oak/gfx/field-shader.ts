// The procedural world every surface in this template renders.
//
// The source's hero was a video scrubbed by scroll — `video.currentTime` tweened
// against a ScrollTrigger, backed by a 25MB mp4. That is a lot of bytes to ship
// for something the visitor only ever sees as a slow dissolve, and it is fragile:
// scrubbing a compressed video means seeking between keyframes, which stutters on
// exactly the mid-range hardware most visitors have.
//
// This replaces it. The same ScrollTrigger drives `uProgress` instead of
// `currentTime`, so the choreography is identical and the "footage" is a warm,
// slow-moving liquid field generated per frame. Nothing is downloaded and nothing
// has to seek.

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
uniform float uPreset;
// 0..1. On the hero this is scroll position; elsewhere it stays at 0 and the
// field simply loops on time.
uniform float uProgress;
uniform float uMotion;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, float gain) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = rot * p * 2.03;
    amp *= gain;
  }
  return sum;
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);

  float t = uTime * uMotion;
  float regime = uPreset;

  // Scroll pushes the field downward and slows it, so the hero reads as a pour
  // settling rather than a loop playing.
  float fall = uProgress * 1.8;
  float scale = mix(1.8, 3.4, regime);
  float gain = mix(0.46, 0.56, fract(regime * 1.7));

  vec2 p = uv * scale + vec2(t * 0.045, t * 0.03 + fall);

  // Two warp passes. The second is stretched vertically, which is what gives the
  // field its slow downward drift instead of an even swirl.
  vec2 q = vec2(fbm(p, gain), fbm(p + vec2(4.1, 2.6), gain));
  vec2 r = vec2(
    fbm(p + 1.1 * q + vec2(1.7, 9.2) + 0.10 * t, gain),
    fbm(p + 1.1 * q * vec2(1.0, 1.6) + vec2(8.3, 2.8) - 0.08 * t, gain)
  );
  float f = fbm(p + 1.25 * r, gain);

  float ramp = f * 0.5 + 0.5 + uProgress * 0.35;

  // Warm: amber through oak through a low ember red. Deliberately narrow — a bar
  // is one light source, not a spectrum.
  vec3 a = vec3(0.36, 0.22, 0.14);
  vec3 b = vec3(0.38, 0.26, 0.16);
  vec3 c = vec3(1.0, 0.92, 0.78) * mix(0.55, 1.0, regime);
  vec3 d = vec3(0.06, 0.14, 0.22) + vec3(regime * 0.22);

  vec3 col = palette(ramp, a, b, c, d);

  // Caustic highlights: the bright ridges where the warp folds back on itself,
  // which is what reads as light through liquid.
  float caustic = pow(clamp(1.0 - abs(f) * 1.7, 0.0, 1.0), 3.5);
  col += caustic * vec3(1.0, 0.78, 0.45) * mix(0.18, 0.42, regime);

  float vignette = smoothstep(1.5, 0.2, length(uv));
  col *= mix(0.42, 1.0, vignette);

  float grain = hash22(gl_FragCoord.xy + fract(t) * 137.0).x * 0.03;
  col += grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** Named points on the preset dial, one per surface that used to be an asset. */
export const PRESETS = {
  heroPour: 0.32,
  aboutPlate: 0.58,
  artPlate: 0.16,
  menuPlate: 0.74,
  contactPlate: 0.9,
} as const;
