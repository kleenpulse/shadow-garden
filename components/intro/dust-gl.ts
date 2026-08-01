/**
 * GPU dust for the intro overlay (IntroOverlay.tsx). Pure module, no React.
 *
 * One ogl point cloud, one draw call. Every grain's full trajectory is a
 * closed-form function of uTime in the vertex shader — no CPU physics, no
 * accumulated state, so motion is frame-rate independent and perfectly smooth.
 * The linear wind front (front(t) = uFrontStart - uFrontSpeed * t) is shared
 * with the DOM mask erosion in the overlay: both read the same clock, so the
 * solid→dust handoff can never desync.
 *
 * Grain lifecycle (all in-shader): hidden until the front passes its release
 * key → held at its home pixel at full alpha (the letter granulates but stays
 * pixel-anchored) → after a per-grain back-loaded peel delay, a drag-limited
 * gust lifts it downstream while buoyancy raises it and wind shear rakes the
 * risen grains ahead, all of it advected through a divergence-free curl field
 * sampled at the grain's *travelling* position — so a grain meets new eddies as
 * it goes, which is the difference between smoke and shimmer. It disperses as
 * it fades: the sprite grows while alpha falls, so the plume thins into haze
 * instead of blinking out.
 */

import { Geometry, Mesh, Program, Renderer } from "ogl";

export interface GrainData {
  count: number;
  home: Float32Array; // count*2 — rest position, viewport CSS px
  color: Float32Array; // count*3 — theme-resolved rgb 0..1
  rand: Float32Array; // count*4 — peel shape / terminal speed / fan / buoyancy
  rand2: Float32Array; // count*4 — flight life / size / release jitter / turb amp
  edge: Float32Array; // count*2 — char right edge x (swap moment) / normalized y in the glyph (0 = crown)
}

export interface DustGL {
  setSize(w: number, h: number): void;
  render(t: number): void; // t = timeline seconds (gsap tl.time())
  dispose(): void; // idempotent
}

const VERTEX = /* glsl */ `
attribute vec2 aHome;
attribute vec3 aColor;
attribute vec4 aRand;
attribute vec4 aRand2;
attribute vec2 aEdge;

uniform float uTime;
uniform float uFrontStart;
uniform float uFrontSpeed;
uniform vec2 uResolution;
uniform float uDpr;

varying vec3 vColor;
varying float vAlpha;

// Stream function, domain-warped (sin inside sin) so the field never reads as
// the periodic sine sum it actually is. The domain scrolls downstream with the
// wind: eddies travel along with the plume rather than standing still in screen
// space, which is the actual signature of smoke.
float psiQ(vec2 q, float t) {
  float s  =        sin(q.x       + 1.7 * sin(q.y * 0.9 + t * 0.35));
  s       += 0.55 * sin(q.y * 2.1 - 1.3 * sin(q.x * 1.7 - t * 0.50));
  s       += 0.26 * sin((q.x + q.y) * 3.9 + t * 0.95);
  return s;
}

// Curl of psi — divergence-free, so the cloud swirls instead of pumping (a
// plain gradient field has sources and sinks: grains pile up and thin out in
// fixed spots, which reads as jitter). Differenced in normalized q space so the
// result is O(1) and the caller's amplitude stays in readable pixels.
vec2 curl(vec2 p, float t) {
  const float e = 0.06;
  vec2 q = p * 0.0055 - vec2(t * 0.62, 0.0);
  float dy = psiQ(q + vec2(0.0, e), t) - psiQ(q - vec2(0.0, e), t);
  float dx = psiQ(q + vec2(e, 0.0), t) - psiQ(q - vec2(e, 0.0), t);
  return vec2(dy, -dx) / (2.0 * e);
}

void main() {
  // The whole char turns granular the instant the front touches its right
  // edge (the DOM glyph swaps out) — every grain of it becomes visible at
  // home, full alpha. No mask, no wipe line: erosion is purely granular.
  float visibleT = (uFrontStart - aEdge.x) / uFrontSpeed;
  // A grain leaves once the front passes its own x (plus positive jitter so
  // dust lifts off the still-held face) — right-to-left, ragged, per-grain.
  float key = aHome.x + aRand2.z * 40.0;
  float releaseT = max((uFrontStart - key) / uFrontSpeed, visibleT);
  // Back-loaded peel: grains hold at home after release so the silhouette
  // stays anchored — but the window is tight (~2 chars of front travel), so
  // a char is mostly gone before the front reaches its second neighbor. The
  // crown of a glyph goes first (aEdge.y = 0 at the top): wind takes the
  // exposed top of a letter before it gets under the base.
  float peel = 0.34 * pow(aRand.x, 0.7) * mix(0.55, 1.0, clamp(aEdge.y, 0.0, 1.0));
  float life = mix(1.0, 1.9, aRand2.x);
  float tf = clamp(uTime - releaseT - peel, 0.0, life);
  float lifeFrac = tf / life;

  // Drag-limited surge: v(t) = vterm * (1 - exp(-t/tau)) integrated — gentle
  // lift-off into a fast wash. sqrt bias favors screamers.
  float tau = 0.22;
  float vterm = mix(150.0, 460.0, sqrt(aRand.y));
  float base = vterm * (tf - tau * (1.0 - exp(-tf / tau)));

  // Buoyancy, accelerating — dust lifts as it loosens. Screen y is down.
  float rise = (mix(26.0, 88.0, aRand.w) * tf + 16.0) * tf;
  // Wind shear: the higher a grain climbs the faster the wind carries it, so
  // the plume rakes up-and-right in a curve instead of shooting flat.
  float dx = base * (1.0 + rise * 0.0016);
  // Fan spread: quadratic center-bias — soft tails peel off above and below.
  float fan = aRand.z * 2.0 - 1.0;
  float dy = fan * abs(fan) * 90.0 * tf - rise;

  vec2 ballistic = aHome + vec2(dx, dy);
  // Amplitude grows super-linearly with flight time: the diffusion-like spread
  // that frays the plume into wisps, without integrating any state.
  float turbAmp = mix(0.7, 1.5, aRand2.w) * 78.0 * pow(tf, 1.3);
  // The held face breathes before it lets go. Ramps from zero at the swap so
  // the granular glyph is pixel-identical to the DOM one on the handoff frame.
  float held = clamp(uTime - visibleT, 0.0, 1.0);
  // Sampled at the travelling position, never at aHome — a grain has to enter
  // new eddies as it flies or the whole cloud just shimmers in place.
  vec2 pos = ballistic + curl(ballistic, uTime) * (turbAmp + 3.2 * held * held);

  // Hidden until the char swap / held 1 / flight: opaque through most of the
  // travel, then a long tail. Fast grains slightly ghosted — motion blur.
  float lifeK = 1.0 - lifeFrac;
  float alpha = step(visibleT, uTime) * pow(lifeK, 1.7);
  alpha *= mix(1.0, 0.62, (vterm / 460.0) * step(0.001, tf));
  vAlpha = alpha;
  vColor = aColor;

  // Base size covers the sampling stride so the swap reads near-solid; the
  // 2.7x growth is dispersal — alpha falls faster than area grows, so total
  // ink still drops while each grain thins into haze.
  gl_PointSize = mix(2.6, 3.6, aRand2.y) * mix(1.0, 2.7, pow(lifeFrac, 0.75)) * uDpr;
  gl_Position = vec4(
    pos.x / uResolution.x * 2.0 - 1.0,
    1.0 - pos.y / uResolution.y * 2.0,
    0.0,
    1.0
  );
  // Cull invisible points entirely — zero fragment cost.
  if (vAlpha < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision mediump float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  // Gaussian minus its own edge pedestal: soft volumetric falloff that still
  // reaches exactly zero at the sprite bounds, so no square cutoff shows when
  // the points grow late in life. A hard disc reads as sand.
  float m = max(exp(-dot(d, d) * 11.0) - 0.064, 0.0) * 1.068;
  float a = vAlpha * m;
  gl_FragColor = vec4(vColor * a, a); // premultiplied
}
`;

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/**
 * Rasterize every char span's glyph into grain arrays at its current viewport
 * position. Offscreen 2D sampling at scale 1 — device-independent counts.
 */
export function sampleWord(
  spans: (HTMLElement | null)[],
  budgetPerChar: number,
): GrainData {
  const home: number[] = [];
  const color: number[] = [];
  const rand: number[] = [];
  const rand2: number[] = [];
  const edge: number[] = [];

  for (const span of spans) {
    if (!span) continue;
    const rect = span.getBoundingClientRect();
    const text = span.textContent;
    if (!text || rect.width < 1 || rect.height < 1) continue;

    const cs = getComputedStyle(span);
    const fontSize = parseFloat(cs.fontSize);

    const w = Math.ceil(rect.width) + 8;
    const h = Math.ceil(rect.height) + 8;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;

    // Canvas normalizes any computed color to "#rrggbb" — free theme-correct
    // parsing (computed colors here are always opaque).
    ctx.fillStyle = cs.color;
    const hex = String(ctx.fillStyle);
    let r = 1;
    let g = 1;
    let b = 1;
    if (hex.startsWith("#") && hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16) / 255;
      g = parseInt(hex.slice(3, 5), 16) / 255;
      b = parseInt(hex.slice(5, 7), 16) / 255;
    }

    // Firefox's computed `font` shorthand is empty — build it from parts.
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
    ctx.textAlign = "center";

    const originY = rect.top + rect.height / 2 - h / 2;
    // Baseline-exact vertical alignment: canvas "middle" baseline centers the
    // em box, which sits a few px off the DOM glyph at display sizes — the
    // granular ghost would visibly jump at the swap. Reconstruct the DOM
    // baseline from font metrics (half-leading model) and draw alphabetic.
    const metrics = ctx.measureText(text);
    const fba = metrics.fontBoundingBoxAscent;
    const fbd = metrics.fontBoundingBoxDescent;
    if (Number.isFinite(fba) && Number.isFinite(fbd) && fba + fbd > 0) {
      const halfLeading = (rect.height - (fba + fbd)) / 2;
      const baselineViewportY = rect.top + halfLeading + fba;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, w / 2, baselineViewportY - originY);
    } else {
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2);
    }

    // Adaptive stride: ~budgetPerChar grains per glyph regardless of font
    // size. 0.45 ≈ ink coverage of a bold uppercase mono glyph.
    const inkArea = rect.width * fontSize * 0.45;
    const gap = Math.max(2, Math.ceil(Math.sqrt(inkArea / budgetPerChar)));

    const data = ctx.getImageData(0, 0, w, h).data;
    const originX = rect.left + rect.width / 2 - w / 2;

    for (let py = 0; py < h; py += gap) {
      for (let px = 0; px < w; px += gap) {
        if (data[(py * w + px) * 4 + 3] > 128) {
          // Jitter inside the grain's own sampled cell (±gap/2, so ±1px at
          // display sizes): the silhouette is unchanged but the held face
          // stops reading as the halftone lattice the fixed stride produces.
          const y = originY + py + (Math.random() - 0.5) * gap;
          home.push(originX + px + (Math.random() - 0.5) * gap, y);
          color.push(r, g, b);
          rand.push(Math.random(), Math.random(), Math.random(), Math.random());
          rand2.push(Math.random(), Math.random(), Math.random(), Math.random());
          // Normalized height in the glyph, 0 at the crown — drives peel order.
          edge.push(rect.right, (y - rect.top) / rect.height);
        }
      }
    }
  }

  return {
    count: home.length / 2,
    home: new Float32Array(home),
    color: new Float32Array(color),
    rand: new Float32Array(rand),
    rand2: new Float32Array(rand2),
    edge: new Float32Array(edge),
  };
}

/**
 * Build the point cloud on the overlay's canvas. Throws when WebGL is
 * unavailable or init fails — caller degrades to mask-wipe-only erosion.
 * The canvas must never have held a 2D context.
 */
export function createDustGL(
  canvas: HTMLCanvasElement,
  grains: GrainData,
  opts: {
    width: number;
    height: number;
    dpr: number;
    frontStart: number;
    frontSpeed: number;
  },
): DustGL {
  if (!supportsWebGL()) throw new Error("WebGL unavailable");
  if (!(opts.frontSpeed > 0)) throw new Error("frontSpeed must be > 0");

  const renderer = new Renderer({
    canvas,
    width: opts.width,
    height: opts.height,
    dpr: opts.dpr,
    alpha: true,
    premultipliedAlpha: true,
    depth: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  const gl = renderer.gl;
  if (gl.isContextLost()) throw new Error("context lost at init");
  gl.clearColor(0, 0, 0, 0);

  const geometry = new Geometry(gl, {
    aHome: { size: 2, data: grains.home },
    aColor: { size: 3, data: grains.color },
    aRand: { size: 4, data: grains.rand },
    aRand2: { size: 4, data: grains.rand2 },
    aEdge: { size: 2, data: grains.edge },
  });

  const uniforms = {
    uTime: { value: 0 },
    uFrontStart: { value: opts.frontStart },
    uFrontSpeed: { value: opts.frontSpeed },
    uResolution: { value: new Float32Array([opts.width, opts.height]) },
    uDpr: { value: opts.dpr },
  };

  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: FRAGMENT,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
    throw new Error("dust shader failed to link");
  }

  const mesh = new Mesh(gl, { geometry, program, mode: gl.POINTS });

  let disposed = false;
  return {
    setSize(w, h) {
      if (disposed) return;
      renderer.setSize(w, h);
      uniforms.uResolution.value[0] = w;
      uniforms.uResolution.value[1] = h;
    },
    render(t) {
      if (disposed) return;
      uniforms.uTime.value = t;
      renderer.render({ scene: mesh });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
