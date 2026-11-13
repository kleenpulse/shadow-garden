"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A ringless giant, its moons and the star that lights them, ray traced in one
// fragment shader. No meshes, no shadow maps, no scene graph.
//
// Four decisions carry this.
//
// **Every body is an analytic sphere, so the eclipse is solved, not sampled.**
// From any lit point the sun and a moon are two discs in the sky. How much of
// the sun's disc the moon's disc covers is the shadow: full cover is the umbra,
// partial cover the penumbra, and a moon too small to cover the sun leaves a
// ring of it showing. A shadow map can only blur a hard edge to fake this; here
// the penumbra widens with distance on its own, because the geometry says so.
//
// **Each orbit is hinged on the line from the sun through the planet.** `tilt`
// swings the orbital planes around that line instead of away from it, so every
// moon still crosses in front of the sun and behind the planet once per lap at
// any tilt. Tilting the planes the usual way would leave an orrery where
// nothing ever eclipses anything.
//
// **Edges are antialiased by coverage, not by supersampling.** A sphere's
// silhouette is known exactly, so each body is grown by half a pixel, the
// overlap is turned into an alpha, and only those edge pixels trace a second
// ray for what lies behind. One ray for almost every pixel, two on a rim.
//
// **The camera, not the scene, takes the drag.** Orbit state lives in a ref the
// frame loop reads, so looking around never re-renders React and never restarts
// the moons.
export interface UmbralOrreryProps {
  /** How many moons orbit the planet, 1 to 6. */
  moonCount?: number;
  /** Multiplier on every orbit. Inner moons always lap faster than outer ones. */
  orbitSpeed?: number;
  /** Swing of the orbital planes around the sun line, in radians. */
  tilt?: number;
  /** Moon radius, with the planet at 1. Each moon scales this a little. */
  moonSize?: number;
  /** Angular radius of the sun, in radians. A larger sun softens every shadow edge. */
  sunSize?: number;
  /** Brightness of the sunlight. */
  sunIntensity?: number;
  /** Strength of the planet's atmosphere glow. */
  atmosphere?: number;
  /** Brightness of the orbit traces. 0 hides them. */
  trails?: number;
  /** Speed of the idle camera orbit, in radians per second. */
  drift?: number;
  /** Magnification. Narrows the field of view. */
  zoom?: number;
  /** Colour of the sun and its light. */
  sunColor?: string;
  /** Colour of the planet's atmosphere. */
  glowColor?: string;
  /** Base colour of the planet's cloud bands. */
  planetColor?: string;
  /** Colour of deep space. */
  backgroundColor?: string;
  /** Halt the loop. One still frame stays painted and can still be dragged. */
  paused?: boolean;
  className?: string;
}

const MOONS = 6;
const TAU = Math.PI * 2;
const CAMERA_DISTANCE = 11;
const ORBIT_INNER = 1.75;
const ORBIT_STEP = 0.46;
const PITCH_LIMIT = 1.35;
/** tan of half the vertical field of view at zoom 1. */
const HALF_FOV_TAN = 0.384;

/** One row per moon, fixed by index so adding a moon never reshuffles the rest.
 *  `lean` offsets the moon's plane from the shared tilt. `miss` is how far from
 *  the sun line the moon crosses it, in planet radii, which is the latitude its
 *  shadow tracks across. `size` scales the shared moon radius. */
const ORBITS = [
  { phase: 2.82, lean: 0.0, miss: 0.18, size: 1.0 },
  { phase: 1.0, lean: 0.22, miss: -0.42, size: 0.72 },
  { phase: 5.25, lean: -0.16, miss: 0.5, size: 1.28 },
  { phase: 2.3, lean: 0.3, miss: -0.1, size: 0.6 },
  { phase: 4.3, lean: -0.27, miss: 0.34, size: 0.95 },
  { phase: 0.2, lean: 0.12, miss: -0.55, size: 0.8 },
];

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const setLinear = (out: Float32Array, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  out[0] = Math.pow(r, 2.2);
  out[1] = Math.pow(g, 2.2);
  out[2] = Math.pow(b, 2.2);
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const supportsWebGL2 = () => {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
out vec4 fragColor;

#define MOONS 6
#define TAU 6.28318530718

uniform vec2  uRes;
uniform float uDpr;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uFocal;
uniform float uCount;
uniform vec4  uMoon[MOONS];
uniform vec4  uOrbU[MOONS];
uniform vec4  uOrbV[MOONS];
uniform float uSunSize;
uniform float uSunPower;
uniform float uAtmo;
uniform float uTrails;
uniform vec2  uSpin;
uniform vec3  uSunCol;
uniform vec3  uGlowCol;
uniform vec3  uPlanetCol;
uniform vec3  uBg;

const vec3 SUN_POS = vec3(-90.0, 0.0, 0.0);
const vec3 SUN_DIR = vec3(-1.0, 0.0, 0.0);

const vec3 MOON_TINT[MOONS] = vec3[](
  vec3(0.62, 0.60, 0.58),
  vec3(0.50, 0.55, 0.64),
  vec3(0.68, 0.56, 0.42),
  vec3(0.66, 0.60, 0.72),
  vec3(0.72, 0.69, 0.62),
  vec3(0.60, 0.44, 0.38)
);

// Angular size of one buffer pixel, set once per fragment.
float gPx;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x);
  float b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x);
  float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x);
  float d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm(vec3 p, int octaves) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < octaves; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

// How much of the sun's disc is still visible from p past a sphere. Both are
// discs in p's sky: a is the sun's angular radius, b the sphere's, d the angle
// between their centres. No overlap is full light, full overlap is the umbra,
// and a sphere smaller than the sun can only ever hide (b/a)^2 of it.
float sunVisible(vec3 p, vec3 c, float r) {
  vec3 toSun = normalize(SUN_POS - p);
  vec3 toC = c - p;
  float dc = length(toC);
  if (dc <= r) return 1.0;
  toC /= dc;
  float a = uSunSize;
  float b = asin(r / dc);
  // atan of cross and dot, not acos of dot: acos loses all its precision
  // exactly where the two discs line up, which is the moment that matters.
  float d = atan(length(cross(toSun, toC)), dot(toSun, toC));
  float cover = min(1.0, (b * b) / (a * a));
  return 1.0 - cover * (1.0 - smoothstep(abs(b - a), a + b, d));
}

float shadow(vec3 p, int self) {
  float vis = self == 0 ? 1.0 : sunVisible(p, vec3(0.0), 1.0);
  for (int i = 0; i < MOONS; i++) {
    if (float(i) >= uCount) break;
    if (i + 1 == self) continue;
    vis *= sunVisible(p, uMoon[i].xyz, uMoon[i].w);
  }
  return vis;
}

// Sphere grown by half a pixel. cov is how much of the pixel the true sphere
// fills, so the silhouette can be blended instead of stair-stepped.
float sphere(vec3 ro, vec3 rd, vec3 c, float r, out float cov) {
  vec3 oc = ro - c;
  float tc = -dot(oc, rd);
  cov = 0.0;
  if (tc <= 0.0) return -1.0;
  float d2 = max(dot(oc, oc) - tc * tc, 0.0);
  float w = gPx * tc;
  float grown = r + 0.5 * w;
  if (d2 >= grown * grown) return -1.0;
  cov = clamp((grown - sqrt(d2)) / w, 0.0, 1.0);
  return tc - sqrt(grown * grown - d2);
}

// id: -1 sky, 0 planet, 1.. moons.
void trace(vec3 ro, vec3 rd, int skip, out int id, out float t, out float cov) {
  id = -1;
  t = 1e9;
  cov = 1.0;
  float c;
  if (skip != 0) {
    float tp = sphere(ro, rd, vec3(0.0), 1.0, c);
    if (tp > 0.0) { id = 0; t = tp; cov = c; }
  }
  for (int i = 0; i < MOONS; i++) {
    if (float(i) >= uCount) break;
    if (i + 1 == skip) continue;
    float tm = sphere(ro, rd, uMoon[i].xyz, uMoon[i].w, c);
    if (tm > 0.0 && tm < t) { id = i + 1; t = tm; cov = c; }
  }
}

vec3 sunLight() {
  return mix(vec3(1.0), uSunCol, 0.4) * uSunPower;
}

vec3 atmoLight(vec3 n, vec3 rd) {
  float day = smoothstep(-0.25, 0.5, dot(n, SUN_DIR));
  // Looking toward the sun through the limb: the air scatters forward, which
  // is what lights the whole ring when the planet eclipses the sun.
  float fwd = pow(max(dot(rd, SUN_DIR), 0.0), 6.0);
  vec3 c = uGlowCol * (0.03 + 0.85 * day);
  c += mix(uGlowCol, uSunCol, 0.55) * fwd * 3.0;
  return c * uAtmo;
}

vec3 planetAlbedo(vec3 n) {
  n.xy = mat2(0.94, -0.342, 0.342, 0.94) * n.xy;
  // Rigid spin, passed as a cos/sin pair so the angle can wrap without the
  // noise field jumping at the seam.
  n.xz = mat2(uSpin.x, -uSpin.y, uSpin.y, uSpin.x) * n.xz;
  float lat = n.y;
  float warp = fbm(n * 2.3 + 4.0, 4);
  float swirl = fbm(vec3(n.x * 3.0, lat * 9.0, n.z * 3.0) + warp * 1.8, 5);
  float bands = sin(lat * 11.0 + (warp - 0.5) * 3.4 + swirl * 2.2);
  bands = 0.72 * bands + 0.28 * sin(lat * 27.0 + swirl * 5.0 + warp * 2.0);
  float fine = fbm(vec3(n.x * 6.0, lat * 34.0, n.z * 6.0) + swirl * 2.5, 4);
  vec3 deep = uPlanetCol * 0.4;
  vec3 mid = uPlanetCol * 1.5 + 0.012;
  vec3 pale = mix(uPlanetCol * 2.6, vec3(0.80, 0.74, 0.92), 0.38);
  vec3 col = mix(deep, mid, smoothstep(-0.7, 0.5, bands));
  col = mix(col, pale, smoothstep(0.15, 1.0, bands) * (0.2 + 0.6 * fine));
  col *= 0.7 + 0.6 * fine;
  col *= 1.0 - 0.4 * smoothstep(0.55, 1.0, abs(lat));
  return col;
}

vec3 shadePlanet(vec3 p, vec3 rd) {
  vec3 n = normalize(p);
  float ndl = dot(n, normalize(SUN_POS - p));
  vec3 alb = planetAlbedo(n);
  float vis = ndl > -0.3 ? shadow(p, 0) : 1.0;
  float diff = smoothstep(-0.04 - uSunSize, 0.3, ndl) * (0.3 + 0.7 * max(ndl, 0.0));
  // Light that reaches the terminator has crossed the most air, so it arrives red.
  vec3 light = sunLight() * mix(vec3(1.0, 0.5, 0.3), vec3(1.0), smoothstep(-0.02, 0.34, ndl));
  vec3 col = alb * light * diff * vis;
  col += alb * uGlowCol * 0.01;
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.5);
  col += atmoLight(n, rd) * fres * mix(1.0, vis, 0.6);
  return col;
}

vec3 shadeMoon(int i, vec3 p, vec3 rd) {
  vec3 c = uMoon[i].xyz;
  float r = uMoon[i].w;
  vec3 n = normalize(p - c);
  vec3 q = n * 2.6 + float(i) * 7.3;
  // Finite-difference bump: tilt the normal down the slope of the same noise
  // that paints the surface, so dark patches read as basins.
  float e = 0.06;
  float h0 = fbm(q, 4);
  vec3 grad = vec3(fbm(q + vec3(e, 0, 0), 4), fbm(q + vec3(0, e, 0), 4), fbm(q + vec3(0, 0, e), 4)) - h0;
  n = normalize(n - (grad - n * dot(grad, n)) * 5.0);
  float maria = smoothstep(0.42, 0.62, fbm(q * 0.7 + 3.1, 3));
  vec3 alb = MOON_TINT[i] * (0.5 + 0.7 * h0) * (1.0 - 0.45 * maria);

  vec3 toSun = normalize(SUN_POS - p);
  float ndl = dot(n, toSun);
  float lit = shadow(p, i + 1);
  float diff = smoothstep(-uSunSize, 0.12, ndl) * pow(max(ndl, 0.0), 0.75);
  vec3 col = alb * sunLight() * diff * lit;

  // Planetshine: the lit face of the planet is a second, dim lamp. A moon on
  // the sun side looks back at all of it, a moon behind the planet at none.
  float dp = length(c);
  vec3 toPlanet = -c / dp;
  float phase = 0.5 - 0.5 * dot(toPlanet, SUN_DIR);
  float bounce = max(dot(n, toPlanet), 0.0) * phase / (dp * dp);
  col += alb * mix(uPlanetCol * 2.0 + 0.1, uGlowCol, 0.35) * bounce * uSunPower * 0.7;

  // Inside the planet's shadow the only sunlight left is what its atmosphere
  // bends around the limb, and that light is ember red.
  float inPlanetShadow = 1.0 - sunVisible(p, vec3(0.0), 1.0);
  col += alb * uSunCol * vec3(1.0, 0.3, 0.14) * inPlanetShadow * max(ndl, 0.0) * 0.07 * uSunPower * uAtmo;
  return col;
}

vec3 sky(vec3 rd) {
  vec3 col = vec3(0.0);

  // A wide view takes in far more sky, so it shows a smaller share of the
  // stars and the count on screen holds steady. Zooming in brings the rest
  // out the way a longer lens would, without reshuffling the field.
  float keep = clamp(uFocal * uFocal / 15.0, 0.06, 1.0);
  for (int k = 0; k < 2; k++) {
    float scale = k == 0 ? 52.0 : 17.0;
    vec3 id = floor(rd * scale);
    vec3 h = hash33(id + float(k) * 31.7);
    if (fract(h.y * 13.7 + h.x * 5.3) > keep) continue;
    vec3 s = normalize(id + 0.5 + (h - 0.5) * 0.7);
    float d = length(rd - s);
    float r = gPx * uDpr * (k == 0 ? 0.75 : 1.15);
    // Most stars are faint and a few are not: a steep power on the hash is
    // what keeps the field from reading as evenly scattered snow.
    float mag = fract(h.x * 7.13 + h.z * 3.71);
    float bright = k == 0 ? 0.02 + 0.55 * pow(mag, 6.0) : 0.05 + 1.6 * pow(mag, 4.0);
    vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.72), h.y);
    col += tint * bright * smoothstep(r * 1.6, r * 0.2, d);
  }

  float cloud = fbm(rd * 1.7 + 2.0, 4);
  float knot = fbm(rd * 4.1 - 7.0, 3);
  float dust = smoothstep(0.42, 0.8, cloud) * (0.35 + 0.65 * knot);
  col += mix(uGlowCol, uSunCol * 0.6, knot * 0.7) * dust * 0.03;

  vec3 sd = normalize(SUN_POS - uCamPos);
  float th = atan(length(cross(rd, sd)), dot(rd, sd));
  float x = th / uSunSize;
  float disc = 1.0 - smoothstep(1.0 - 2.0 * gPx / uSunSize, 1.0, x);
  float mu = sqrt(max(1.0 - x * x, 0.0));
  // Limb darkening: the edge of the disc is seen through more of the sun, so
  // it is dimmer and redder than the centre. Without it the sun is a flat coin.
  col += mix(uSunCol * 1.1, vec3(1.0, 0.96, 0.88), pow(mu, 0.7)) * (0.3 + 0.7 * mu) * uSunPower * 3.6 * disc;

  // The corona belongs to the sky, not the lens: a body in front of the sun
  // hides the disc but leaves the streamers standing around its edge.
  if (x < 9.0) {
    vec3 e1 = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
    vec3 e2 = cross(sd, e1);
    float ang = atan(dot(rd, e2), dot(rd, e1));
    float streamer = fbm(vec3(cos(ang), sin(ang), 0.3) * 3.2 + x * 0.1, 4);
    float corona = exp(-max(x - 1.0, 0.0) * 1.15) * (0.3 + 1.6 * streamer * streamer);
    col += uSunCol * corona * uSunPower * 0.6 * (1.0 - disc) * (1.0 - smoothstep(7.0, 9.0, x));
  }
  return col;
}

// Air outside the limb, for rays that pass the planet without touching it.
vec3 halo(vec3 ro, vec3 rd, float tMax) {
  float tc = -dot(ro, rd);
  if (tc <= 0.0 || tc > tMax) return vec3(0.0);
  vec3 pc = ro + rd * tc;
  float b = length(pc);
  float h = max(b - 1.0, 0.0);
  float fall = 0.88 * exp(-h / (0.022 + 0.014 * uAtmo)) + 0.12 * exp(-h / 0.2);
  return atmoLight(pc / b, rd) * fall;
}

vec3 trails(vec3 ro, vec3 rd, float tMax) {
  vec3 acc = vec3(0.0);
  if (uTrails <= 0.0) return acc;
  for (int i = 0; i < MOONS; i++) {
    if (float(i) >= uCount) break;
    vec3 U = uOrbU[i].xyz;
    vec3 V = uOrbV[i].xyz;
    vec3 N = cross(U, V);
    float dn = dot(rd, N);
    if (abs(dn) < 1e-4) continue;
    float t = -dot(ro, N) / dn;
    if (t <= 0.0 || t >= tMax) continue;
    vec3 q = ro + rd * t;
    vec2 pl = vec2(dot(q, U), dot(q, V));
    float rad = length(pl);
    float d = abs(rad - uOrbU[i].w);
    // Distance to the ring measured on screen, so the trace holds one pixel of
    // width whether its plane is seen face on or nearly edge on.
    vec3 er = (U * pl.x + V * pl.y) / max(rad, 1e-4);
    float px = d * length(er - rd * dot(er, rd)) / (gPx * t);
    float line = 1.0 - smoothstep(0.6 * uDpr, 1.7 * uDpr, px);
    line *= 1.0 - smoothstep(0.03, 0.09, d);
    line *= smoothstep(0.012, 0.07, abs(dn));
    // Brightest at the moon, fading back along the lap it has just flown.
    float behind = mod(uOrbV[i].w - atan(pl.y, pl.x), TAU) / TAU;
    float fade = 0.07 + 0.93 * pow(1.0 - behind, 3.0);
    acc += mix(uGlowCol, vec3(1.0), 0.45) * line * fade * 0.55;
  }
  return acc * uTrails;
}

vec4 surface(vec3 ro, vec3 rd, int id, float t) {
  if (id == 0) return vec4(shadePlanet(ro + rd * t, rd), 0.0);
  vec3 col;
  float open;
  if (id > 0) {
    col = shadeMoon(id - 1, ro + rd * t, rd);
    open = 0.0;
  } else {
    col = sky(rd);
    open = 1.0;
  }
  col += halo(ro, rd, t);
  return vec4(col, open);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamFwd * uFocal + uCamRight * p.x + uCamUp * p.y);
  gPx = 2.0 / (uRes.y * uFocal);

  int id;
  float t;
  float cov;
  trace(ro, rd, -1, id, t, cov);
  vec4 c = surface(ro, rd, id, t);
  if (id >= 0 && cov < 1.0) {
    int id2;
    float t2;
    float cov2;
    trace(ro, rd, id, id2, t2, cov2);
    c = mix(surface(ro, rd, id2, t2), c, cov);
  }
  vec3 col = c.rgb;
  col += trails(ro, rd, t);

  // Lens bloom, scaled by how much of the sun the camera itself can see, so it
  // drains away as the sun slides behind the planet instead of popping off.
  float seen = sunVisible(ro, vec3(0.0), 1.0);
  for (int i = 0; i < MOONS; i++) {
    if (float(i) >= uCount) break;
    seen *= sunVisible(ro, uMoon[i].xyz, uMoon[i].w);
  }
  vec3 sd = normalize(SUN_POS - ro);
  float th = atan(length(cross(rd, sd)), dot(rd, sd));
  float bloom = 0.045 / (1.0 + th * th * 90.0) + 0.4 * exp(-th / (uSunSize * 1.8));
  // A body in front of the glare keeps most of its silhouette: full bloom over
  // open sky, a quarter of it over anything solid.
  col += uSunCol * bloom * seen * uSunPower * mix(0.25, 1.0, c.a);

  col = pow(aces(col), vec3(1.0 / 2.2));
  // The backdrop goes in after tone mapping and only where the sky is open, so
  // it comes out as the exact colour that was asked for.
  col = 1.0 - (1.0 - col) * (1.0 - uBg * c.a);
  col += (hash13(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

const UmbralOrrery = memo(
  ({
    moonCount = 4,
    orbitSpeed = 1,
    tilt = 0.3,
    moonSize = 0.2,
    sunSize = 0.05,
    sunIntensity = 1.6,
    atmosphere = 1,
    trails = 0.6,
    drift = 0.03,
    zoom = 1.5,
    sunColor = "#ffb24d",
    glowColor = "#a855f7",
    planetColor = "#4b3a8c",
    backgroundColor = "#05060a",
    paused = false,
    className,
  }: UmbralOrreryProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    // Camera orbit. Yaw wraps; pitch stops short of the poles, because a camera
    // that rolls over the top reads as a bug. The resting pose puts the sun over
    // the left shoulder so most of the day side, and the shadows on it, face us.
    const orbit = useRef({
      yaw: -0.85, pitch: 0.22, vYaw: 0, vPitch: 0,
      dragging: false, pointerId: -1, lastX: 0, lastY: 0, lastT: 0,
    });

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      dpr: 2,
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    const live = useRef({
      moonCount, orbitSpeed, tilt, moonSize, sunSize, sunIntensity, atmosphere,
      trails, drift, zoom, sunColor, glowColor, planetColor, backgroundColor,
    });
    live.current = {
      moonCount, orbitSpeed, tilt, moonSize, sunSize, sunIntensity, atmosphere,
      trails, drift, zoom, sunColor, glowColor, planetColor, backgroundColor,
    };

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;
      // Checked here, in the same effect that builds the renderer. A separate
      // effect that only sets the flag loses the race: both run in the mount
      // commit, so the renderer is constructed against a null context and
      // throws before the fallback ever renders.
      if (!supportsWebGL2()) {
        setFallback(true);
        return;
      }

      const renderer = new Renderer({
        webgl: 2,
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
        dpr: 1,
      });
      const gl = renderer.gl;
      glRef.current = gl;

      const canvas = gl.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      // Out of flow — ogl's setSize writes an explicit pixel width, and in flow that
      // raises the container's min-content width so it never shrinks again.
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      container.appendChild(canvas);

      // Plain arrays, not Float32Arrays. ogl resolves an array uniform by
      // walking "uMoon[0]" into a base name and an index, and a typed array
      // fails that walk: the upload is skipped and the shader reads zeroes.
      const moon: number[] = new Array(MOONS * 4).fill(0);
      const orbU: number[] = new Array(MOONS * 4).fill(0);
      const orbV: number[] = new Array(MOONS * 4).fill(0);

      const uniforms = {
        uRes: { value: new Float32Array([1, 1]) },
        uDpr: { value: 1 },
        uCamPos: { value: new Float32Array(3) },
        uCamRight: { value: new Float32Array(3) },
        uCamUp: { value: new Float32Array(3) },
        uCamFwd: { value: new Float32Array(3) },
        uFocal: { value: 1 },
        uCount: { value: 1 },
        uMoon: { value: moon },
        uOrbU: { value: orbU },
        uOrbV: { value: orbV },
        uSunSize: { value: sunSize },
        uSunPower: { value: sunIntensity },
        uAtmo: { value: atmosphere },
        uTrails: { value: trails },
        uSpin: { value: new Float32Array([1, 0]) },
        uSunCol: { value: new Float32Array(3) },
        uGlowCol: { value: new Float32Array(3) },
        uPlanetCol: { value: new Float32Array(3) },
        uBg: { value: new Float32Array(3) },
      };

      const program = new Program(gl, { vertex, fragment, uniforms });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

      const angles = ORBITS.map((o) => o.phase);
      let spin = 0;
      let aspect = 1;

      const renderAll = () => {
        const l = live.current;
        const o = orbit.current;

        for (let i = 0; i < MOONS; i++) {
          const s = ORBITS[i];
          const R = ORBIT_INNER + i * ORBIT_STEP;
          // V is the in-plane axis square to the sun line; tilt swings it
          // around that line. U starts on the line and is tipped off it by
          // just enough that the moon crosses `miss` away from dead centre.
          const lean = l.tilt + s.lean;
          const vy = Math.sin(lean);
          const vz = Math.cos(lean);
          const sd = s.miss / R;
          const cd = Math.sqrt(1 - sd * sd);
          const ux = cd;
          const uy = -vz * sd;
          const uz = vy * sd;
          const ca = Math.cos(angles[i]);
          const sa = Math.sin(angles[i]);
          const k = i * 4;
          moon[k] = R * ca * ux;
          moon[k + 1] = R * (ca * uy + sa * vy);
          moon[k + 2] = R * (ca * uz + sa * vz);
          moon[k + 3] = l.moonSize * s.size;
          orbU[k] = ux;
          orbU[k + 1] = uy;
          orbU[k + 2] = uz;
          orbU[k + 3] = R;
          orbV[k] = 0;
          orbV[k + 1] = vy;
          orbV[k + 2] = vz;
          orbV[k + 3] = angles[i];
        }

        const cp = Math.cos(o.pitch);
        const sp = Math.sin(o.pitch);
        const cy = Math.cos(o.yaw);
        const sy = Math.sin(o.yaw);
        // Unit vector from the planet to the camera, then the basis that looks
        // back down it with world +y as up.
        const dx = sy * cp;
        const dy = sp;
        const dz = cy * cp;
        uniforms.uCamPos.value.set([dx * CAMERA_DISTANCE, dy * CAMERA_DISTANCE, dz * CAMERA_DISTANCE]);
        uniforms.uCamFwd.value.set([-dx, -dy, -dz]);
        uniforms.uCamRight.value.set([cy, 0, -sy]);
        uniforms.uCamUp.value.set([-sy * sp, cp, -cy * sp]);
        // Narrowing the field of view instead of dollying in keeps the camera
        // outside every orbit. A tall container widens it back out, so the
        // system is never cropped to a sliver on a phone.
        uniforms.uFocal.value = (Math.max(l.zoom, 0.1) / HALF_FOV_TAN) * Math.min(1, aspect / 1.1);

        uniforms.uCount.value = clamp(Math.round(l.moonCount), 1, MOONS);
        uniforms.uSunSize.value = clamp(l.sunSize, 0.004, 0.3);
        uniforms.uSunPower.value = l.sunIntensity;
        uniforms.uAtmo.value = l.atmosphere;
        uniforms.uTrails.value = l.trails;
        uniforms.uSpin.value[0] = Math.cos(spin);
        uniforms.uSpin.value[1] = Math.sin(spin);
        setLinear(uniforms.uSunCol.value, l.sunColor);
        setLinear(uniforms.uGlowCol.value, l.glowColor);
        setLinear(uniforms.uPlanetCol.value, l.planetColor);
        uniforms.uBg.value.set(hexToRgb(l.backgroundColor));

        renderer.render({ scene: mesh });
      };

      drawRef.current = (dt) => {
        const l = live.current;
        const o = orbit.current;
        if (!o.dragging) {
          // Momentum first, then the idle drift, so a fling hands off to the
          // drift instead of fighting it. Neither runs while the scene is held.
          o.yaw += o.vYaw * dt + l.drift * dt;
          o.pitch = clamp(o.pitch + o.vPitch * dt, -PITCH_LIMIT, PITCH_LIMIT);
          const decay = Math.pow(0.92, dt * 60);
          o.vYaw *= decay;
          o.vPitch *= decay;
        }
        o.yaw %= TAU;
        for (let i = 0; i < MOONS; i++) {
          // Kepler's third law: angular speed falls with radius to the 3/2.
          const R = ORBIT_INNER + i * ORBIT_STEP;
          const omega = 0.55 * Math.pow(ORBIT_INNER / R, 1.5);
          angles[i] = (angles[i] + omega * l.orbitSpeed * dt) % TAU;
        }
        spin = (spin + 0.05 * l.orbitSpeed * dt) % TAU;
        renderAll();
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        uniforms.uRes.value[0] = gl.drawingBufferWidth;
        uniforms.uRes.value[1] = gl.drawingBufferHeight;
        uniforms.uDpr.value = dpr;
        aspect = width / Math.max(height, 1);
        // Bake one corrected frame so a halted picture is never stale after a
        // resize; the host then paints its own on top.
        renderAll();
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    useEffect(() => {
      loop.paint();
    }, [
      moonCount, orbitSpeed, tilt, moonSize, sunSize, sunIntensity, atmosphere,
      trails, drift, zoom, sunColor, glowColor, planetColor, backgroundColor, loop,
    ]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      o.dragging = true;
      o.pointerId = e.pointerId;
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      o.lastT = e.timeStamp;
      o.vYaw = 0;
      o.vPitch = 0;
      e.currentTarget.setPointerCapture(e.pointerId);
      loop.start();
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      if (!o.dragging || e.pointerId !== o.pointerId) return;
      const dt = (e.timeStamp - o.lastT) / 1000;
      // The scene follows the hand, so the camera goes the other way: drag
      // right and it circles left. Vertically the camera is what moves, and
      // pitch here is its elevation, so dragging down lifts it and brings the
      // planet's north pole toward you. Flip that sign and the axis fights
      // the hand.
      const dYaw = -(e.clientX - o.lastX) * 0.006;
      const dPitch = (e.clientY - o.lastY) * 0.005;
      o.yaw += dYaw;
      o.pitch = clamp(o.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
      if (dt > 0.001) {
        // Velocity from the last segment only. Averaging the whole gesture
        // makes a drag that slowed to a stop still fling on release.
        o.vYaw = dYaw / dt;
        o.vPitch = dPitch / dt;
      }
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      o.lastT = e.timeStamp;
      loop.start();
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      if (o.pointerId !== -1 && e.currentTarget.hasPointerCapture(o.pointerId)) {
        e.currentTarget.releasePointerCapture(o.pointerId);
      }
      // A pointer that rested before lifting has no momentum to hand over.
      if (e.timeStamp - o.lastT > 90) {
        o.vYaw = 0;
        o.vPitch = 0;
      }
      o.dragging = false;
      o.pointerId = -1;
      loop.start();
    };

    if (fallback) {
      return (
        <div
          className={`overflow-hidden ${className ?? "relative h-full w-full"}`}
          style={{
            backgroundColor,
            backgroundImage: `radial-gradient(circle at 50% 50%, transparent 0 17%, ${glowColor}55 17.5%, transparent 21%), radial-gradient(circle at 44% 46%, ${planetColor} 0, #07060d 17%, transparent 17.4%)`,
          }}
        />
      );
    }

    return (
      <div
        ref={containerRef}
        // The canvas is appended imperatively, so touch-action is set through
        // the container. Without it a finger orbiting the scene scrolls the page.
        className={`cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing [&_canvas]:touch-none ${className ?? "relative h-full w-full"}`}
        style={{ backgroundColor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    );
  },
);

UmbralOrrery.displayName = "UmbralOrrery";

export default UmbralOrrery;
