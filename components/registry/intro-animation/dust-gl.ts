/**
 * GPU dust for IntroAnimation.tsx. Pure module, no React, no loop of its own —
 * the component's animation-loop host owns the clock and calls render().
 *
 * One ogl point cloud, one draw call. Every grain's full trajectory is a
 * closed-form function of uTime in the vertex shader — no CPU physics, no
 * accumulated state, so motion is frame-rate independent and perfectly smooth.
 * The linear wind front (front(t) = uFrontStart - uFrontSpeed * t) is shared
 * with the DOM glyph handoff in the component: both read the same clock, so the
 * solid to dust swap can never desync.
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
  home: Float32Array; // count*2 — rest position, container CSS px
  tint: Float32Array; // count*1 — 0 = ink, 1 = accent
  rand: Float32Array; // count*4 — peel shape / terminal speed / fan / buoyancy
  rand2: Float32Array; // count*4 — flight life / size / release jitter / turb amp
  edge: Float32Array; // count*2 — char right edge x (swap moment) / normalized y in the glyph (0 = crown)
}

/** Live-tunable values. Every one is a uniform, so dragging a control never
 *  rebuilds the context or re-rasterizes a glyph. */
export interface DustParams {
  /** Multiplier on each grain's terminal downstream speed. */
  wind: number;
  /** Multiplier on the accelerating lift. */
  buoyancy: number;
  /** Multiplier on the curl-field amplitude that frays the plume. */
  turbulence: number;
  /** Multiplier on sprite size. */
  grainSize: number;
  /** rgb 0..1 for tint 0 and tint 1. */
  ink: [number, number, number];
  accent: [number, number, number];
}

export interface DustGL {
  /** The live context, so the loop host can lose it on teardown. */
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** Owned by this module — created on build, removed on dispose. */
  readonly canvas: HTMLCanvasElement;
  setSize(w: number, h: number, dpr: number): void;
  /** Swap the point cloud in place. The context survives — dispose() is
   *  terminal, so a re-measure after a resize must come through here. */
  setGrains(grains: GrainData): void;
  /** The wind front moves with the wordmark, so a re-measure re-aims it. */
  setFront(frontStart: number, frontSpeed: number): void;
  setParams(params: DustParams): void;
  render(t: number): void; // t = sequence seconds
  dispose(): void; // idempotent
}

/**
 * Seconds a char's grains take to speckle in, measured from the front touching
 * its right edge. The DOM glyph stays solid underneath for exactly this long —
 * grains are the same colour on the same pixels, so the ramp is invisible and
 * the handoff has no pop. The component converts this to px of front travel to
 * time its `visibility: hidden`; both sides must use this number or the glyph
 * vanishes before its dust is up.
 */
export const GRAIN_IN = 0.1;

/**
 * Minimum hold between a grain's release and its first movement. Must exceed
 * GRAIN_IN: the DOM glyph is still painted during the speckle-in, so a grain
 * that flew away early would leave the solid glyph sitting over a hole it had
 * already vacated — then blink out when the span hides.
 */
const PEEL_FLOOR = 0.12;

const VERTEX = /* glsl */ `
attribute vec2 aHome;
attribute float aTint;
attribute vec4 aRand;
attribute vec4 aRand2;
attribute vec2 aEdge;

uniform float uTime;
uniform float uFrontStart;
uniform float uFrontSpeed;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uWind;
uniform float uBuoy;
uniform float uTurb;
uniform float uGrainSize;
uniform vec3 uInk;
uniform vec3 uAccent;

const float GRAIN_IN = ${GRAIN_IN.toFixed(3)};
const float PEEL_FLOOR = ${PEEL_FLOOR.toFixed(3)};

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

// Cheap per-grain hash off the home position — granulation order needs its own
// randomness and every aRand channel is already spoken for.
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

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
  // A char starts granulating when the front touches its right edge, but its
  // grains do not all arrive at once — each waits out its own slice of the
  // GRAIN_IN window, so the letter crackles into dust instead of switching
  // over in one frame. The DOM glyph is still solid underneath for the whole
  // window, hiding the ramp entirely. No mask, no wipe line.
  float granT = (uFrontStart - aEdge.x) / uFrontSpeed;
  float visibleT = granT + GRAIN_IN * hash12(aHome);
  // A grain leaves once the front passes its own x (plus positive jitter so
  // dust lifts off the still-held face) — right-to-left, ragged, per-grain.
  float key = aHome.x + aRand2.z * 40.0;
  float releaseT = max((uFrontStart - key) / uFrontSpeed, visibleT);
  // Back-loaded peel: grains hold at home after release so the silhouette
  // stays anchored — but the window is tight (~2 chars of front travel), so
  // a char is mostly gone before the front reaches its second neighbor. The
  // crown of a glyph goes first (aEdge.y = 0 at the top): wind takes the
  // exposed top of a letter before it gets under the base. The floor is the
  // handoff guarantee — see PEEL_FLOOR.
  float peel = PEEL_FLOOR
    + 0.30 * pow(aRand.x, 0.7) * mix(0.55, 1.0, clamp(aEdge.y, 0.0, 1.0));
  float life = mix(1.0, 1.9, aRand2.x);
  float tf = clamp(uTime - releaseT - peel, 0.0, life);
  float lifeFrac = tf / life;

  // Drag-limited surge: v(t) = vterm * (1 - exp(-t/tau)) integrated — gentle
  // lift-off into a fast wash. sqrt bias favors screamers.
  float tau = 0.22;
  // Rank kept separate from the tuned speed: the motion-blur ghost below keys
  // off how fast this grain is *relative to its peers*, which is a property of
  // the grain. Fold uWind into it and turning the wind down would un-ghost the
  // whole field instead of just slowing it.
  float vrank = mix(150.0, 460.0, sqrt(aRand.y));
  float vterm = vrank * uWind;
  float base = vterm * (tf - tau * (1.0 - exp(-tf / tau)));

  // Buoyancy, accelerating — dust lifts as it loosens. Screen y is down.
  float rise = (mix(26.0, 88.0, aRand.w) * tf + 16.0) * tf * uBuoy;
  // Wind shear: the higher a grain climbs the faster the wind carries it, so
  // the plume rakes up-and-right in a curve instead of shooting flat.
  float dx = base * (1.0 + rise * 0.0016);
  // Fan spread: quadratic center-bias — soft tails peel off above and below.
  float fan = aRand.z * 2.0 - 1.0;
  float dy = fan * abs(fan) * 90.0 * tf - rise;

  vec2 ballistic = aHome + vec2(dx, dy);
  // Amplitude grows super-linearly with flight time: the diffusion-like spread
  // that frays the plume into wisps, without integrating any state.
  float turbAmp = mix(0.7, 1.5, aRand2.w) * 78.0 * pow(tf, 1.3) * uTurb;
  // The held face breathes before it lets go — a heat-haze shimmer that reads
  // as the letter loosening rather than waiting. Squared ramp from zero at the
  // grain's own arrival, so it is still sub-pixel while the DOM glyph is up.
  float held = clamp((uTime - visibleT) / 0.35, 0.0, 1.0);
  // Sampled at the travelling position, never at aHome — a grain has to enter
  // new eddies as it flies or the whole cloud just shimmers in place.
  vec2 pos = ballistic + curl(ballistic, uTime) * (turbAmp + 2.5 * held * held);

  // Arrival is a brief per-grain fade rather than a step — with the hash
  // stagger above, the char stipples in. Then opaque through most of the
  // travel and a long tail. Fast grains slightly ghosted — motion blur.
  float lifeK = 1.0 - lifeFrac;
  float alpha = clamp((uTime - visibleT) / 0.05, 0.0, 1.0) * pow(lifeK, 1.7);
  alpha *= mix(1.0, 0.62, (vrank / 460.0) * step(0.001, tf));
  vAlpha = alpha;
  vColor = mix(uInk, uAccent, aTint);
  // Drives the sprite profile: solid ink at rest, haze in flight.
  vSoft = pow(lifeFrac, 0.6);

  // Base size covers the sampling stride so the swap reads near-solid; the
  // 2.7x growth is dispersal — alpha falls faster than area grows, so total
  // ink still drops while each grain thins into haze.
  gl_PointSize =
    mix(2.6, 3.6, aRand2.y) * mix(1.0, 2.7, pow(lifeFrac, 0.75)) * uDpr * uGrainSize;
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
varying float vSoft;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  // At rest the sprite is a plateau disc with a soft rim. This is what makes
  // the granulated glyph match solid ink: a gaussian's coverage collapses to
  // roughly half the sprite, so a field of them reads visibly lighter and
  // greyer than the DOM text it replaces — the letter appears to dim as it
  // cracks. In flight it morphs to a gaussian, where the soft falloff is
  // exactly what turns overlapping grains into haze instead of sand.
  float disc = 1.0 - smoothstep(0.34, 0.5, r);
  float haze = max(exp(-r * r * 11.0) - 0.064, 0.0) * 1.068;
  float m = mix(disc, haze, vSoft);
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

/** "#rrggbb" or "#rgb" to rgb 0..1. Falls back to white on anything else. */
export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return [1, 1, 1];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * Rasterize every char span's glyph into grain arrays at its current position
 * relative to `origin` (the container's client rect). Offscreen 2D sampling at
 * scale 1 — device-independent counts.
 *
 * `splitIndex` is the first span index that carries the accent tint; the colour
 * itself is a uniform, so a colour change never comes back through here.
 */
export function sampleWord(
  spans: (HTMLElement | null)[],
  origin: { left: number; top: number },
  budgetPerChar: number,
  splitIndex: number,
): GrainData {
  const home: number[] = [];
  const tint: number[] = [];
  const rand: number[] = [];
  const rand2: number[] = [];
  const edge: number[] = [];

  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    if (!span) continue;
    const box = span.getBoundingClientRect();
    const text = span.textContent;
    if (!text || box.width < 1 || box.height < 1) continue;

    // Container-relative, so the cloud tracks the component's own box rather
    // than the viewport — the effect has to survive being scrolled or nested.
    const rect = {
      left: box.left - origin.left,
      top: box.top - origin.top,
      right: box.right - origin.left,
      width: box.width,
      height: box.height,
    };

    const cs = getComputedStyle(span);
    const fontSize = parseFloat(cs.fontSize);

    const w = Math.ceil(rect.width) + 8;
    const h = Math.ceil(rect.height) + 8;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;

    // Firefox's computed `font` shorthand is empty — build it from parts.
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
    ctx.textAlign = "center";
    // Coverage is all that is read back; the colour is applied in the shader.
    ctx.fillStyle = "#ffffff";

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
      const baselineY = rect.top + halfLeading + fba;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, w / 2, baselineY - originY);
    } else {
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2);
    }

    // Adaptive stride: ~budgetPerChar grains per glyph regardless of font
    // size. 0.45 ≈ ink coverage of a bold uppercase glyph.
    const inkArea = rect.width * fontSize * 0.45;
    const gap = Math.max(2, Math.ceil(Math.sqrt(inkArea / budgetPerChar)));

    const data = ctx.getImageData(0, 0, w, h).data;
    const originX = rect.left + rect.width / 2 - w / 2;
    const tintValue = index < splitIndex ? 0 : 1;

    for (let py = 0; py < h; py += gap) {
      for (let px = 0; px < w; px += gap) {
        if (data[(py * w + px) * 4 + 3] > 128) {
          // Jitter inside the grain's own sampled cell (±gap/2, so ±1px at
          // display sizes): the silhouette is unchanged but the held face
          // stops reading as the halftone lattice the fixed stride produces.
          const y = originY + py + (Math.random() - 0.5) * gap;
          home.push(originX + px + (Math.random() - 0.5) * gap, y);
          tint.push(tintValue);
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
    tint: new Float32Array(tint),
    rand: new Float32Array(rand),
    rand2: new Float32Array(rand2),
    edge: new Float32Array(edge),
  };
}

/**
 * Build the point cloud and append its canvas to `container`. Throws when WebGL
 * is unavailable or init fails — the caller degrades to the reveal alone.
 *
 * The canvas is created here rather than accepted from JSX, and that is
 * load-bearing. Disposing a GL surface means losing its context, and a lost
 * context is permanent *for that element*: React keeps the same <canvas> node
 * across a client-side navigation, so a JSX canvas comes back from the next
 * mount handing out the same dead context, `getContext` and all. Owning the
 * element means every build gets a genuinely new one.
 */
export function createDustGL(
  container: HTMLElement,
  grains: GrainData,
  opts: {
    width: number;
    height: number;
    dpr: number;
    frontStart: number;
    frontSpeed: number;
    params: DustParams;
  },
): DustGL {
  if (!supportsWebGL()) throw new Error("WebGL unavailable");
  if (!(opts.frontSpeed > 0)) throw new Error("frontSpeed must be > 0");

  const renderer = new Renderer({
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

  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.style.display = "block";
  // Out of flow — setSize writes an explicit pixel width, and in flow that
  // raises the container's min-content width so it never shrinks again.
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.pointerEvents = "none";
  container.appendChild(canvas);

  const buildGeometry = (g: GrainData) =>
    new Geometry(gl, {
      aHome: { size: 2, data: g.home },
      aTint: { size: 1, data: g.tint },
      aRand: { size: 4, data: g.rand },
      aRand2: { size: 4, data: g.rand2 },
      aEdge: { size: 2, data: g.edge },
    });

  const uniforms = {
    uTime: { value: 0 },
    uFrontStart: { value: opts.frontStart },
    uFrontSpeed: { value: opts.frontSpeed },
    uResolution: { value: new Float32Array([opts.width, opts.height]) },
    uDpr: { value: opts.dpr },
    uWind: { value: opts.params.wind },
    uBuoy: { value: opts.params.buoyancy },
    uTurb: { value: opts.params.turbulence },
    uGrainSize: { value: opts.params.grainSize },
    uInk: { value: new Float32Array(opts.params.ink) },
    uAccent: { value: new Float32Array(opts.params.accent) },
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

  let geometry = buildGeometry(grains);
  let mesh = new Mesh(gl, { geometry, program, mode: gl.POINTS });
  let disposed = false;

  return {
    gl,
    canvas,
    setSize(w, h, dpr) {
      if (disposed) return;
      renderer.dpr = dpr;
      renderer.setSize(w, h);
      uniforms.uResolution.value[0] = w;
      uniforms.uResolution.value[1] = h;
      uniforms.uDpr.value = dpr;
    },
    setGrains(next) {
      if (disposed || next.count === 0) return;
      // Buffers are replaced, never the context: dispose() is one-way, so a
      // re-measure has to reuse the live renderer or the canvas goes dead.
      const previous = geometry;
      geometry = buildGeometry(next);
      mesh = new Mesh(gl, { geometry, program, mode: gl.POINTS });
      previous.remove();
    },
    setFront(frontStart, frontSpeed) {
      if (disposed || !(frontSpeed > 0)) return;
      uniforms.uFrontStart.value = frontStart;
      uniforms.uFrontSpeed.value = frontSpeed;
    },
    setParams(params) {
      if (disposed) return;
      uniforms.uWind.value = params.wind;
      uniforms.uBuoy.value = params.buoyancy;
      uniforms.uTurb.value = params.turbulence;
      uniforms.uGrainSize.value = params.grainSize;
      uniforms.uInk.value.set(params.ink);
      uniforms.uAccent.value.set(params.accent);
    },
    render(t) {
      if (disposed) return;
      uniforms.uTime.value = t;
      renderer.render({ scene: mesh });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.remove();
      // Element goes with the context. Leaving a canvas whose context has been
      // lost in the tree is what makes the next mount unrecoverable.
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
