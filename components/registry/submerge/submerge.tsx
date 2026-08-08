"use client";

import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Real, still-interactive content held under water. The text is selectable, the
// button takes focus and the link is a link — the water bends the live tree
// rather than a picture of it.
//
// Six decisions carry this.
//
// **The shapes are baked once; a frame is only attribute writes.** feImage needs
// a URL, and turning a canvas into one costs a PNG encode — far too expensive to
// run per frame. So the disturbances are rasterised up front and every live
// ripple is one of those images moved, scaled and faded.
//
// **A press radiates; a drag trails.** They are not the same event and rendering
// both as concentric circles is the tell. A press gets an isotropic ring — a
// dropped stone. A drag gets a wake: squashed ahead, drawn out behind, and
// weighted so it is strongest directly astern. feImage has no transform
// attribute, so orientation comes from baking one copy per angle bucket and
// swapping the href, which costs one attribute write.
//
// **One disturbance is ONE trough and ONE crest.** A packet carrying several
// oscillations paints concentric rings from a single source, so a drag reads as
// a stack of dropped stones no matter what shape the envelope is. The wave is a
// single cycle, windowed to exactly zero at the rim.
//
// **The pointer must outrun the wave.** A Kelvin wake is the envelope of many
// circular sources emitted along a path, and the V only exists where the body
// travels faster than the water answers. Sources are therefore spaced by
// DISTANCE, kept small, and grown slowly — a ring that sprints out at four
// figures of pixels per second overtakes every drag and there is no envelope
// left to see.
//
// **Ripples accumulate by ALPHA, not by arithmetic.** feComposite arithmetic
// applies its k4 term everywhere in the region, including outside the sprite's
// own box where the input is transparent black — so every live ripple used to
// drag the whole rest of the surface by -0.5·strength. That is a global lurch
// during a drag, and it reads as jitter. `over` against a neutral flood is a
// lerp weighted by the sprite's alpha, which is exactly nothing where the sprite
// is not. So the sprite carries MAGNITUDE in alpha and DIRECTION in colour.
//
// **The crest highlight lives inside the filter.** Drawn as DOM rings it is a
// perfect circle whatever the displacement underneath is doing — the shape work
// is invisible because a circle is painted over it. Taken from the blue channel
// of the ripple accumulator instead, the highlight is the wake. It branches off
// BEFORE the ambient current is mixed in, so still water glows nowhere.
export interface SubmergeProps {
  children?: ReactNode;
  /** How deep the content sits — tint and how far the light carries. */
  depth?: number;
  /** Speed of the ambient current. */
  flow?: number;
  /** How much the ambient current bends the content. */
  turbulence?: number;
  /** Strength of the wake the pointer leaves. */
  rippleForce?: number;
  /** How far a disturbance travels before it dies. */
  rippleSpread?: number;
  /** Seconds a ripple takes to die away. */
  settle?: number;
  /** How much of the element's own silhouette is protected. */
  edgeHold?: number;
  /** Shallow water — the colour of a crest. */
  waterColor?: string;
  /** Deep water. */
  deepColor?: string;
  /** Halt the loop. The surface freezes. */
  paused?: boolean;
  /** The water goes still. Content stays put and readable. */
  reducedMotion?: boolean;
  className?: string;
}

/** Concurrent disturbances. Each costs one full-region composite, so this is the
 *  real budget knob; ten covers roughly a third of a screen of drag history. */
const RIPPLES = 10;
/** One period of the scrolling flow map, in CSS pixels. The current scrolls and
 *  wraps at exactly this distance, so the field it scrolls MUST repeat at
 *  exactly this distance too — see buildFlowTile. */
const TILE = 320;
/** Lattice cells across one tile, coarse octave. The fine octave doubles it.
 *  Cell size is TILE/FLOW_CELLS ≈ 107px, which is the scale of the swells. */
const FLOW_CELLS = 3;
/** Pointer travel between spawned sources, as a fraction of the SHORT side.
 *  Measured in pixels rather than in normalised box units — normalised, the same
 *  gesture spawns twice as densely vertically on a wide box.
 *
 *  Spacing is a TRAIL-LENGTH decision, not a smoothness one. Each wake sprite is
 *  already about one and a half of its own radii long, so sources far closer than
 *  that buy nothing but a shorter trail: ten of them packed tight cover a third
 *  of a drag and pile into nested arcs around the cursor, which reads as rings
 *  again. Spread out, the same ten cover the whole gesture and still overlap
 *  several deep. */
const SPAWN_FRACTION = 0.09;
/** Edge of a baked sprite, in px. Upscaled by feImage; every shape here is
 *  smooth, so the interpolation never shows. */
const SPRITE_RES = 160;
/** Angle buckets for the wake. feImage has no transform attribute, so the only
 *  way to orient one is to bake a copy per direction and swap the href. The
 *  teardrop is asymmetric enough that thirty degrees snaps visibly; this does
 *  not. */
const WAKE_ANGLES = 16;

/** How far the wake reaches ahead of, behind and beside its origin, as a
 *  fraction of the sprite's half-width. Behind reaches more than twice as far as
 *  ahead — that ratio IS the trailing read. All three stay under 1 so the shape
 *  closes inside the bitmap; a packet still alive at the edge leaves a square
 *  seam the moment feImage scales it up. */
const NOSE = 0.45;
const TAIL = 1;
const SIDE = 0.62;
/** Where the single wave cycle sits and how wide it is, in shape radii. */
const PEAK_AT = 0.62;
const PEAK_WIDTH = 0.34;

/** Ambient current amplitude, in byte deviations from neutral. Deliberately
 *  modest: ripple and current share one displacement map, and a map that clips
 *  goes FLAT, which is a hard visible artifact. The bend lost here comes back in
 *  DISPLACE_BASE, so the ambient look is unchanged and the ripples gain headroom. */
const FLOW_AMP = 100;
/** Displacement in px per unit of map deviation, before depth and turbulence. */
const DISPLACE_BASE = 46;
/** Ceiling on a single sprite's blend weight. At 1 a ripple would wholly replace
 *  the current beneath it, and the sum of ripple and current would clip. */
const MAX_WEIGHT = 0.68;

/** Assumed seconds between spawns before a gesture has produced two. */
const DEFAULT_GAP = 0.12;
/** Bounds on the fraction of `settle` a wake may live. The ceiling is the old
 *  fixed value; the floor keeps a frantic drag from leaving nothing behind. */
const WAKE_LIFE_MAX = 0.85;
const WAKE_LIFE_MIN = 0.18;

/** Normalised exponential approach: 0 at p=0, 1 at p=1, finite slope at both.
 *  A square root also decelerates but has an INFINITE slope at zero, so every
 *  ring is born already travelling and the birth itself reads as a snap. */
const ringGrowth = (p: number) => (1 - Math.exp(-2.8 * p)) / (1 - Math.exp(-2.8));

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};

/** Value noise on a lattice that WRAPS, which is what makes the flow tile
 *  seamless — without the modulo the scroll shows a hard seam once per period. */
function makeNoise(cellsX: number, cellsY: number, seed: number) {
  const hash = (ix: number, iy: number) => {
    const x = ((ix % cellsX) + cellsX) % cellsX;
    const y = ((iy % cellsY) + cellsY) % cellsY;
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  return (u: number, v: number) => {
    const fx = u * cellsX;
    const fy = v * cellsY;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/** One period of the slow current: R = x push, G = y push, B = height, A = 255.
 *
 *  Sampled in TILE space — `x / TILE`, not `x / canvasWidth`. That single divisor
 *  is the whole invariant. makeNoise's lattice wraps at its cell count, so
 *  sampling across the canvas gives a field whose period is the CANVAS, and the
 *  scroll below wraps at TILE. The two only agree when the box happens to be a
 *  multiple of TILE, which it never is, so every wrap swapped the entire surface
 *  for uncorrelated noise — a whole-element jump of up to ten pixels, every
 *  thirty seconds, with nothing touching the element. */
function buildFlowTile(): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const nx1 = makeNoise(FLOW_CELLS, FLOW_CELLS, 1);
  const ny1 = makeNoise(FLOW_CELLS, FLOW_CELLS, 2);
  const nx2 = makeNoise(FLOW_CELLS * 2, FLOW_CELLS * 2, 3);
  const ny2 = makeNoise(FLOW_CELLS * 2, FLOW_CELLS * 2, 4);

  const img = ctx.createImageData(TILE, TILE);
  const data = img.data;
  for (let y = 0; y < TILE; y++) {
    const v = y / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = x / TILE;
      const dx = nx1(u, v) - 0.5 + (nx2(u, v) - 0.5) * 0.5;
      const dy = ny1(u, v) - 0.5 + (ny2(u, v) - 0.5) * 0.5;
      const i = (y * TILE + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 + dx * FLOW_AMP));
      data[i + 1] = Math.max(0, Math.min(255, 128 + dy * FLOW_AMP));
      data[i + 2] = Math.max(0, Math.min(255, 128 + (dx + dy) * FLOW_AMP * 0.43));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Size-independent, so it is baked once for the life of the module — same
 *  reasoning as the sprites below. */
let FLOW_TILE: HTMLCanvasElement | null | undefined;
function flowTile() {
  if (FLOW_TILE === undefined) FLOW_TILE = buildFlowTile();
  return FLOW_TILE;
}

/** The map handed to feImage: the tile, repeated. Periodicity is now structural
 *  rather than asserted — a `repeat` pattern IS exactly periodic at the tile, at
 *  every canvas size, so there is no box for which the scroll wrap can show. */
function buildFlowMap(w: number, h: number): string {
  const tile = flowTile();
  if (!tile) return "";
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return "";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL();
}

/** One disturbance, baked once.
 *
 *  `heading` below 0 bakes the isotropic form a press gets — a dropped stone.
 *  At or above 0 it bakes a WAKE travelling in that direction: the wave sits on
 *  an oval squashed ahead of the origin and drawn out behind it, and its
 *  amplitude is weighted astern, because a body dragged through water leaves a
 *  trail behind rather than a ring around.
 *
 *  ALPHA carries magnitude and COLOUR carries direction, because the sprites are
 *  accumulated with `over` — a lerp weighted by alpha. Encoding the signed offset
 *  in colour alone would need arithmetic, whose constant term leaks outside the
 *  sprite's box and shoves the whole surface. Where alpha is zero the sprite is
 *  genuinely absent, which is the only honest way to say "nothing happens here". */
function buildDisturbance(heading: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_RES;
  canvas.height = SPRITE_RES;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(SPRITE_RES, SPRITE_RES);
  const data = img.data;
  const half = SPRITE_RES / 2;
  const directional = heading >= 0;
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);

  for (let y = 0; y < SPRITE_RES; y++) {
    for (let x = 0; x < SPRITE_RES; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const i = (y * SPRITE_RES + x) * 4;

      // Rotate into the wake's own frame: +s is the direction of travel.
      const s = directional ? dx * ch + dy * sh : dx;
      const t = directional ? -dx * sh + dy * ch : dy;
      const rs = directional ? (s > 0 ? s / NOSE : s / TAIL) : s;
      const rt = directional ? t / SIDE : t;
      const r = Math.hypot(rs, rt);

      // A single cycle: trough inside, crest outside, zero at both ends. More
      // cycles than this and one source alone draws concentric rings.
      const q = (r - PEAK_AT) / PEAK_WIDTH;
      let push = 0;
      if (q > -1 && q < 1) {
        const win = Math.cos(q * Math.PI * 0.5);
        push = Math.sin(q * Math.PI) * win * win;
        if (directional) {
          const m = Math.hypot(s, t);
          const c = m > 1e-5 ? s / m : 0;
          // A CLOSED loop reads as a ring however far you stretch it — that is
          // the whole reason a moving pointer looked like a dropped stone. So the
          // nose is opened out until the wave is a chevron trailing astern, with
          // only a trace left ahead for the bow. The exponent is what does it: a
          // plain cosine falloff still closes the front.
          push *= 0.05 + 0.95 * Math.pow(0.5 - 0.5 * c, 1.35);
        }
      }

      const mag = Math.abs(push);
      if (mag < 1e-3) {
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
        data[i + 3] = 0;
        continue;
      }
      // The colour is the EXTREME the lerp reaches at full weight, so the sign
      // of the wave rides here and the alpha stays unsigned.
      const sgn = push > 0 ? 1 : -1;
      const len = Math.hypot(dx, dy) || 1;
      data[i] = Math.round(128 + (dx / len) * sgn * 127);
      data[i + 1] = Math.round(128 + (dy / len) * sgn * 127);
      data[i + 2] = Math.round(128 + sgn * 110);
      data[i + 3] = Math.round(Math.min(1, mag) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** Every sprite is independent of the element's size, so they are baked exactly
 *  once for the life of the module rather than on every resize. */
let SHAPES: { ring: string; wakes: string[] } | null = null;
function shapes() {
  if (!SHAPES) {
    SHAPES = {
      ring: buildDisturbance(-1),
      wakes: Array.from({ length: WAKE_ANGLES }, (_, i) =>
        buildDisturbance((i / WAKE_ANGLES) * Math.PI * 2),
      ),
    };
  }
  return SHAPES;
}

/** White where the content may be pushed, black where the silhouette must hold. */
function buildTaper(w: number, h: number, hold: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const band = Math.max(
    1,
    Math.min(canvas.width, canvas.height) * 0.5 * Math.min(Math.max(hold, 0), 1),
  );
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const d = Math.min(x, y, canvas.width - 1 - x, canvas.height - 1 - y);
      const t = band <= 1 ? 1 : smoothstep(0, band, d);
      const c = Math.round(t * 255);
      const i = (y * canvas.width + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

interface Ripple {
  x: number;
  y: number;
  age: number;
  alive: boolean;
  /** Which baked sprite this draws — an isotropic ring, or the wake bucket
   *  nearest the direction the pointer was travelling when it was left. */
  href: string;
  /** Radius at birth and at death, as fractions of the long side. A wake barely
   *  grows: the V is the envelope of many sources, and it only forms while the
   *  pointer outruns them. */
  r0: number;
  r1: number;
  /** Fraction of `settle` this one lives. For a wake it is derived from the
   *  measured spawn rate so the ripple is always already dead when its slot
   *  comes round — an evicted ripple vanishes mid-life, and that pop is what
   *  reads as jumpy. */
  life: number;
  /** Peak blend weight. Wakes overlap heavily, so each carries less. */
  gain: number;
}

const Submerge = memo(
  ({
    children,
    depth = 0.45,
    flow = 1.25,
    turbulence = 0.5,
    rippleForce = 0.8,
    rippleSpread = 1,
    settle = 1.6,
    edgeHold = 0.35,
    waterColor = "#bacffe",
    deepColor = "#d9e7f3",
    paused = false,
    reducedMotion = false,
    className,
  }: SubmergeProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<SVGFEImageElement>(null);
    const dispRef = useRef<SVGFEDisplacementMapElement>(null);
    const spriteRefs = useRef<(SVGFEImageElement | null)[]>([]);
    const gateRefs = useRef<(SVGFEComponentTransferElement | null)[]>([]);
    const weightRefs = useRef<(SVGFEFuncAElement | null)[]>([]);

    const rawId = useId();
    // Stripped to a bare word: this ends up inside a CSS url(#...) reference and
    // React has emitted both colons and guillemets here across versions. A filter
    // reference that fails to resolve does not fall back to "no filter" — the
    // element is not rendered at all.
    const filterId = `sg-submerge-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    const box = useRef({ w: 0, h: 0 });
    // `gap` is the smoothed interval between spawns, in seconds. It is what
    // tells a wake how long it may live — see spawn.
    const pointer = useRef({
      lastX: NaN,
      lastY: NaN,
      travel: 0,
      lastSpawn: 0,
      gap: DEFAULT_GAP,
    });
    const ripples = useRef<Ripple[]>(
      Array.from({ length: RIPPLES }, () => ({
        x: 0.5, y: 0.5, age: 0, alive: false, href: "",
        r0: 0.04, r1: 0.44, life: 1, gain: 0.7,
      })),
    );
    const nextSlot = useRef(0);
    // Smoothed travel direction. Taken across SPAWNS rather than from the last
    // pointer event: one jittery event otherwise flips the angle bucket and the
    // whole trail snaps to a new heading.
    const heading = useRef({ x: 1, y: 0 });

    const [maps, setMaps] = useState({ flow: "", taper: "", w: 0, h: 0 });

    const live = useRef({
      depth, flow, turbulence, rippleForce, rippleSpread, settle,
      edgeHold, waterColor, deepColor, reducedMotion,
    });
    live.current = {
      depth, flow, turbulence, rippleForce, rippleSpread, settle,
      edgeHold, waterColor, deepColor, reducedMotion,
    };

    const rebuild = useRef<(() => void) | null>(null);
    rebuild.current = () => {
      const { w, h } = box.current;
      if (w < 2 || h < 2) return;
      // Warm the sprites here rather than on the first pointer move: seventeen
      // PNG encodes is a hitch, and a hitch on mount is invisible where a hitch
      // on the first gesture is the whole first impression. Memoised, so every
      // later resize skips it.
      shapes();
      // Only these two depend on the box — and the flow map only in EXTENT now,
      // never in pattern, so a resize no longer re-rolls the current underneath
      // the content.
      setMaps({
        // A tile larger in both axes, so a full period of scroll never uncovers
        // an edge of the element.
        flow: buildFlowMap(w + TILE, h + TILE),
        taper: buildTaper(w, h, live.current.edgeHold),
        w,
        h,
      });
    };

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      onResize: (m: Metrics) => {
        const changed =
          Math.abs(m.width - box.current.w) > 1 ||
          Math.abs(m.height - box.current.h) > 1;
        box.current = { w: m.width, h: m.height };
        if (changed) rebuild.current?.();
      },
      onFrame: ({ dt, elapsed }) => {
        const l = live.current;
        const { w, h } = box.current;
        if (w < 2 || h < 2) return;

        // Ambient current. Two incommensurate rates so the drift never settles
        // into a visible period, wrapped at exactly one tile. The wrap is only
        // invisible because the map is BUILT as a repeat of that tile — assert
        // the period rather than construct it and the whole surface jumps to a
        // different shape once per wrap, which is the one bug in here you can
        // see from across the room.
        const flowEl = flowRef.current;
        if (flowEl) {
          const t = elapsed * l.flow;
          const ox = -(((t * 19) % TILE) + TILE) % TILE;
          const oy = -(((t * 13) % TILE) + TILE) % TILE;
          flowEl.setAttribute("x", ox.toFixed(2));
          flowEl.setAttribute("y", oy.toFixed(2));
        }

        const long = Math.max(w, h);
        for (let i = 0; i < RIPPLES; i++) {
          const r = ripples.current[i];
          const img = spriteRefs.current[i];
          const gate = gateRefs.current[i];
          const weight = weightRefs.current[i];

          const lifetime = Math.max(l.settle * r.life, 0.05);
          if (r.alive) {
            r.age += dt;
            if (r.age >= lifetime) r.alive = false;
          }

          if (!r.alive) {
            // Weight zero makes the sprite fully transparent, and `over` with a
            // transparent top layer is the identity — a dead slot contributes
            // literally nothing rather than a small constant nothing.
            if (weight) weight.setAttribute("slope", "0");
            continue;
          }

          const p = r.age / lifetime;
          const radius =
            (r.r0 + (r.r1 - r.r0) * ringGrowth(p)) * long * l.rippleSpread;
          // Fade in over the first sliver of life as well as out. A ripple that
          // appears at full strength pops however smoothly it then decays — the
          // attack is what the eye catches, not the release.
          const strength = Math.min(
            MAX_WEIGHT,
            Math.min(1, p / 0.12) * (1 - p) * (1 - p) * l.rippleForce * r.gain,
          );

          const bx = (r.x * w - radius).toFixed(2);
          const by = (r.y * h - radius).toFixed(2);
          const bs = (radius * 2).toFixed(2);

          if (img) {
            if (img.getAttribute("href") !== r.href) {
              img.setAttribute("href", r.href);
            }
            img.setAttribute("x", bx);
            img.setAttribute("y", by);
            img.setAttribute("width", bs);
            img.setAttribute("height", bs);
          }
          if (gate) {
            // The gate's subregion tracks the sprite's box so the weighting pass
            // rasterises the sprite rather than the whole element.
            gate.setAttribute("x", bx);
            gate.setAttribute("y", by);
            gate.setAttribute("width", bs);
            gate.setAttribute("height", bs);
          }
          if (weight) weight.setAttribute("slope", strength.toFixed(4));
        }

        const disp = dispRef.current;
        if (disp) {
          // Depth adds to the bend: the further under a surface something sits,
          // the further the same slope carries the light across it.
          const push = l.turbulence * DISPLACE_BASE * (0.55 + l.depth * 0.9);
          disp.setAttribute("scale", push.toFixed(2));
        }
      },
      deps: [],
    });

    useEffect(() => {
      rebuild.current?.();
    }, [edgeHold]);

    useEffect(() => {
      loop.paint();
    }, [
      depth, flow, turbulence, rippleForce, rippleSpread, settle,
      waterColor, deepColor, maps, loop,
    ]);

    const spawn = (x: number, y: number, dirX: number, dirY: number) => {
      const slot = nextSlot.current;
      const r = ripples.current[slot];
      const sh = shapes();
      if (dirX !== 0 || dirY !== 0) {
        const angle = Math.atan2(dirY, dirX);
        const bucket =
          ((Math.round((angle / (Math.PI * 2)) * WAKE_ANGLES) % WAKE_ANGLES) +
            WAKE_ANGLES) %
          WAKE_ANGLES;
        r.href = sh.wakes[bucket];
        // Slow. A wake that sprints outward is just a ring with extra steps: the
        // envelope only forms while the pointer wins the race.
        r.r0 = 0.075;
        r.r1 = 0.18;
        // A wake must die of old age, never of eviction. The slots are a strict
        // ring, so the tenth spawn from now takes this one back whether or not it
        // is still visible — and a disturbance deleted mid-life vanishes in a
        // single frame, which is a pop. A fixed lifetime cannot avoid that,
        // because whether it evicts depends on how fast the hand is moving: at
        // the old 0.85 anything past ~300px/s evicted, and a casual sweep is
        // three times that. So the life is one full trip round the ring instead,
        // measured from the gesture actually in progress.
        r.life = Math.max(
          WAKE_LIFE_MIN,
          Math.min(
            WAKE_LIFE_MAX,
            ((RIPPLES - 1) * pointer.current.gap) / Math.max(live.current.settle, 0.05),
          ),
        );
        r.gain = 0.62;
      } else {
        r.href = sh.ring;
        r.r0 = 0.04;
        r.r1 = 0.44;
        r.life = 1;
        r.gain = 0.85;
      }
      r.x = x;
      r.y = y;
      r.age = 0;
      r.alive = true;
      // A ring, not a search for a free slot: the newest disturbance always
      // shows, even when the pointer outruns the decay.
      nextSlot.current = (slot + 1) % RIPPLES;
    };

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      if (live.current.reducedMotion) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const p = pointer.current;

      if (Number.isNaN(p.lastX)) {
        p.lastX = px;
        p.lastY = py;
        p.travel = 0;
        return;
      }
      // Spaced by DISTANCE in pixels, not by frame and not in normalised units.
      // Per frame ties the wake to the pointer's reporting rate; normalised, the
      // same gesture spawns twice as densely vertically on a wide box.
      const dx = px - p.lastX;
      const dy = py - p.lastY;
      p.travel += Math.hypot(dx, dy);
      p.lastX = px;
      p.lastY = py;
      const step = Math.max(10, Math.min(rect.width, rect.height) * SPAWN_FRACTION);
      if (p.travel < step) return;
      p.travel = 0;

      // Smoothed, because one stalled frame would otherwise stretch the next
      // wake's life past its slot. Clamped above so a pause mid-gesture reads as
      // a slow drag rather than as a wake that outlives the whole trail.
      const now = e.timeStamp;
      if (p.lastSpawn > 0) {
        const dtSpawn = Math.min(0.5, Math.max(0.008, (now - p.lastSpawn) / 1000));
        p.gap += (dtSpawn - p.gap) * 0.4;
      }
      p.lastSpawn = now;

      const len = Math.hypot(dx, dy);
      if (len > 1e-5) {
        const hd = heading.current;
        hd.x += (dx / len - hd.x) * 0.35;
        hd.y += (dy / len - hd.y) * 0.35;
        const hl = Math.hypot(hd.x, hd.y) || 1;
        hd.x /= hl;
        hd.y /= hl;
      }
      const hd = heading.current;
      // Left slightly BEHIND the pointer. Water is disturbed where the thing has
      // been, not where it currently is — centring the source on the cursor is
      // what makes a drag look like a moving ring rather than a wake.
      spawn(
        (px - hd.x * step * 0.8) / rect.width,
        (py - hd.y * step * 0.8) / rect.height,
        hd.x,
        hd.y,
      );
      loop.start();
    };

    const press = (e: React.PointerEvent<HTMLDivElement>) => {
      if (live.current.reducedMotion) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // A press is a dropped stone: no direction, so a clean concentric ring.
      spawn(
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
        0,
        0,
      );
      loop.start();
    };

    const release = () => {
      pointer.current.lastX = NaN;
      pointer.current.lastY = NaN;
      // The interval across a gap between gestures is not a drag speed.
      pointer.current.lastSpawn = 0;
    };

    const ready = maps.flow !== "" && maps.taper !== "";
    const deep = hexToRgb01(deepColor);
    const deepCss = `rgb(${Math.round(deep[0] * 255)} ${Math.round(deep[1] * 255)} ${Math.round(deep[2] * 255)})`;

    return (
      <div
        ref={containerRef}
        // isolate confines the blend modes below to this stacking context.
        // touch-none because a finger dragging the surface is the interaction,
        // select-none because a drag across the content would otherwise select
        // it and the browser would answer with pointercancel.
        className={
          className ?? "relative isolate touch-none overflow-hidden select-none"
        }
        onPointerMove={track}
        onPointerDown={press}
        onPointerLeave={release}
        onPointerCancel={release}
      >
        <svg aria-hidden className="absolute h-0 w-0" focusable="false">
          <defs>
            {/* The region is pinned to the element box. The default reaches ten
                per cent beyond it, and out there the maps are undefined —
                arithmetic on premultiplied transparent black resolves to maximum
                displacement rather than none, and draws a hard frame around the
                content. */}
            <filter
              id={filterId}
              colorInterpolationFilters="sRGB"
              x="0"
              y="0"
              width="100%"
              height="100%"
            >
              {ready ? (
                <>
                  {/* Ripples accumulate on their own neutral field, so the crest
                      pass below can branch off a surface that owes nothing to
                      the ambient current — still water must glow nowhere. */}
                  <feFlood
                    floodColor="rgb(128,128,128)"
                    floodOpacity="1"
                    result="acc0"
                  />
                  {Array.from({ length: RIPPLES }, (_, i) => (
                    <feImage
                      key={`spr-${i}`}
                      ref={(el) => {
                        spriteRefs.current[i] = el;
                      }}
                      x="0"
                      y="0"
                      width="0"
                      height="0"
                      preserveAspectRatio="none"
                      result={`spr${i}`}
                    />
                  ))}
                  {Array.from({ length: RIPPLES }, (_, i) => (
                    <feComponentTransfer
                      key={`gate-${i}`}
                      ref={(el) => {
                        gateRefs.current[i] = el;
                      }}
                      in={`spr${i}`}
                      x="0"
                      y="0"
                      width="0"
                      height="0"
                      result={`gate${i}`}
                    >
                      <feFuncA
                        ref={(el) => {
                          weightRefs.current[i] = el;
                        }}
                        type="linear"
                        slope="0"
                        intercept="0"
                      />
                    </feComponentTransfer>
                  ))}
                  {Array.from({ length: RIPPLES }, (_, i) => (
                    // `over` against an opaque field is lerp(acc, sprite, alpha)
                    // — and where the sprite is absent, alpha is zero and this is
                    // the identity. Arithmetic cannot say that: its constant term
                    // lands outside the sprite's box too and shoves the whole
                    // surface by a fraction of every live ripple's strength.
                    <feComposite
                      key={`mix-${i}`}
                      in={`gate${i}`}
                      in2={`acc${i}`}
                      operator="over"
                      result={`acc${i + 1}`}
                    />
                  ))}

                  {/* Crest. Blue carries wave height, so pulling the part above
                      neutral into alpha gives exactly the lit face of each
                      disturbance — in whatever shape that disturbance is. Drawn
                      as DOM rings instead, this was a perfect circle painted over
                      the wake, which made every drag look like a dropped stone
                      no matter what the displacement did. */}
                  <feColorMatrix
                    in={`acc${RIPPLES}`}
                    type="matrix"
                    values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 2.78 0 -1.395"
                    result="crestMask"
                  />
                  <feFlood
                    floodColor={waterColor}
                    floodOpacity="1"
                    result="crestTint"
                  />
                  <feComposite
                    in="crestTint"
                    in2="crestMask"
                    operator="in"
                    result="crestRaw"
                  />
                  <feComponentTransfer in="crestRaw" result="crest">
                    <feFuncA type="linear" slope="0.85" intercept="0" />
                  </feComponentTransfer>

                  <feImage
                    ref={flowRef}
                    href={maps.flow}
                    x="0"
                    y="0"
                    width={maps.w + TILE}
                    height={maps.h + TILE}
                    preserveAspectRatio="none"
                    result="current"
                  />
                  {/* ripples + current − neutral. Both fields are opaque and
                      cover the whole region, so the constant is exact here. */}
                  <feComposite
                    in={`acc${RIPPLES}`}
                    in2="current"
                    operator="arithmetic"
                    k1="0"
                    k2="1"
                    k3="1"
                    k4="-0.5"
                    result="mixed"
                  />
                  <feImage
                    href={maps.taper}
                    x="0"
                    y="0"
                    width={maps.w}
                    height={maps.h}
                    preserveAspectRatio="none"
                    result="taper"
                  />
                  {/* 0.5 + (map - 0.5) * taper. Multiplying by the taper instead
                      would drive every edge pixel to zero, which is MAXIMUM
                      displacement rather than none — the exact opposite of
                      protecting the silhouette. */}
                  <feComposite
                    in="mixed"
                    in2="taper"
                    operator="arithmetic"
                    k1="1"
                    k2="0"
                    k3="-0.5"
                    k4="0.5"
                    result="surface"
                  />
                  <feDisplacementMap
                    ref={dispRef}
                    in="SourceGraphic"
                    in2="surface"
                    scale="0"
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="bent"
                  />
                  {/* The highlight sits ON the water, so it goes on after the
                      bend and after the depth wash — which is inside the filtered
                      subtree precisely so light can land on top of it. */}
                  <feBlend in="crest" in2="bent" mode="screen" />
                </>
              ) : null}
            </filter>
          </defs>
        </svg>

        {/* The live tree, bent in place — never cloned, never snapshotted.
            h-full so a caller who gives the root a definite size (a full-bleed
            pool) can have children fill it. Against an auto-height root the
            percentage resolves to auto, so wrapping a card still sizes to the
            card — one class covers both usages. */}
        <div
          className="relative h-full w-full"
          style={{
            filter: ready && !reducedMotion ? `url(#${filterId})` : undefined,
          }}
        >
          {children}
          {/* Depth. Water takes the warm end of the spectrum out first, so this
              is a wash rather than a veil — multiply keeps the content's own
              contrast instead of flattening it behind a sheet of colour. It sits
              INSIDE the filtered subtree so it is refracted with everything else
              and so the crest highlight lands above it rather than under it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: deepCss,
              mixBlendMode: "multiply",
              opacity: Math.min(0.85, depth * 0.8),
            }}
          />
        </div>
      </div>
    );
  },
);

Submerge.displayName = "Submerge";

export default Submerge;
