"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type CubeFace = "up" | "down" | "right" | "left" | "front" | "back";
export type CubePalette = "classic" | "amethyst" | "mono" | "neon";

/** Host-written per-frame state for a scroll-driven cube. Read inside the
 *  frame loop, never React state — a host writes it sixty times a second. */
export interface CubeDrive {
  /** Radians added to the orbit rig's azimuth, on top of any drag. */
  azimuth: number;
  /** Radians added to the orbit rig's elevation; the pole clamp still applies. */
  elevation: number;
  /** Multiplier on the ambient spin rate, so scroll speed animates the cube. */
  spinBoost: number;
  /** 0..1. Strength of the specular sweep across the stickers and body. The
   *  sweep runs on the cube's own clock (one pass every SHEEN_PERIOD_MS);
   *  this only sets how bright it is, and 0 switches it off. */
  sheen: number;
}

export interface RubiksCubeHandle {
  /** Playhead in quarter-turns, 0..2·scrambleMoveCount. Requires `scrub`. The
   *  first N moves scramble, the next N replay them inverted, so t = 2N is
   *  solved again. Fully reversible: seeking backwards undoes moves. */
  seek(t: number): void;
  setDrive(drive: Partial<CubeDrive>): void;
  /** Pointer delta from an external drag surface — the same re-aim the
   *  canvas's own drag performs, for hosts whose canvas cannot be hit. */
  orbitBy(dx: number, dy: number): void;
}

export interface RubiksCubeProps {
  /** Bind the scramble→solve cycle to an external playhead (`seek` on the
   *  handle) instead of the timers. The sequence is seeded, so the same seed
   *  scrubs the same cube on every load. */
  scrub?: { seed: number };
  /** Device-pixel-ratio cap. */
  maxDpr?: number;
  ref?: Ref<RubiksCubeHandle>;
  /** Spin the whole cube on its own axis, independently of the solve loop. */
  autoRotate?: boolean;
  /** Multiplier on the ambient spin rate. */
  rotationSpeed?: number;
  /** Milliseconds one quarter-turn takes. */
  moveDuration?: number;
  /** Quarter-turns per scramble; the solve replays them inverted. */
  scrambleMoveCount?: number;
  /** Milliseconds held still between scramble and solve. */
  pauseBetweenCycles?: number;
  /** Camera orbit radius, which is what sets the cube's apparent size. */
  cameraDistance?: number;
  /** Seam width between cubies, in cubie widths. */
  gap?: number;
  /** Named sticker scheme. `colors` overrides individual faces. */
  palette?: CubePalette;
  /** Per-face sticker override; any face left out falls back to `palette`. */
  colors?: Partial<Record<CubeFace, string>>;
  /** Plastic body behind the stickers. */
  bodyColor?: string;
  /** Scene backdrop. Ignored when `transparent` is set. */
  background?: string;
  /** Drop the scene backdrop entirely and clear to alpha, so whatever sits
   *  behind the canvas shows through. */
  transparent?: boolean;
  /** Wet-lacquer clearcoat and a faint oil-slick sheen across the stickers. */
  glossy?: boolean;
  /** Emissive stickers plus an additive silhouette halo. */
  glow?: boolean;
  /** Freeze the spin and the solve loop, holding the current pose. */
  paused?: boolean;
  reducedMotion?: boolean;
  /** Fires once, on the first frame actually drawn. The canvas element exists
   *  well before it paints anything — a host that fades the cube in needs the
   *  draw, not the mount, or the transition is spent on an empty canvas. */
  onReady?: () => void;
  className?: string;
}

type Axis = 0 | 1 | 2;
type Layer = -1 | 0 | 1;
type Dir = 1 | -1;
interface Move {
  axis: Axis;
  layer: Layer;
  dir: Dir;
}

const QUARTER = Math.PI / 2;
const DEG = Math.PI / 180;

// Resting orbit angles. Shared by the rig and by the camera the Canvas is
// created with — a hardcoded start position only matches one `cameraDistance`,
// and every other value visibly eases from that wrong radius to the right one
// on the first frames.
const ORBIT_AZIMUTH = 0.7;
const ORBIT_ELEVATION = 0.42;

function orbitPosition(radius: number): [number, number, number] {
  const ce = Math.cos(ORBIT_ELEVATION);
  return [
    radius * ce * Math.sin(ORBIT_AZIMUTH),
    radius * Math.sin(ORBIT_ELEVATION),
    radius * ce * Math.cos(ORBIT_AZIMUTH),
  ];
}
// Degrees per second of ambient spin at rotationSpeed 1. Slow enough that the
// layer turns stay legible while the cube drifts underneath them.
const BASE_SPIN = 13;
// Pointer travel, in px, before a drag is allowed to re-aim the spin axis. Below
// this a resting hand's jitter would churn the axis every frame.
const SWIPE_MIN = 2;
// Rate the spin axis eases toward a swiped one — roughly a third of a second.
const AXIS_EASE = 3;
// Rate the scrub playhead eases toward the host's target (1/s). Wheel events do
// not arrive at a constant rate; a 1:1 write reproduces every gap as a stutter
// in the turning layer.
const SEEK_RATE = 10;
// The scrub playhead never turns faster than the cube's own pace (one
// quarter-turn per moveDuration), the same speed the idle cycle and the classic
// hero run at. Scroll decides where the cube is heading; it never hurries it.
// Idle hysteresis, in quarter-turns of target. A smoothed scroll hovers a few
// pixels either side of zero as it settles; without a band the cube would flip
// between its idle cycle and the scrub every frame and stutter at the top.
const IDLE_ENTER = 0.02;
const IDLE_EXIT = 0.12;
// The scrub's per-move detent. Monotonic, unlike easeTurn's ease-out-back: the
// overshoot is the mechanical click that sells a timer-driven turn, but under a
// scrubbed or fast-moving playhead it reads as every layer wobbling.
function detent(f: number): number {
  return f * f * (3 - 2 * f);
}
const STICKER_SCALE = 0.86;
const AXIS_KEY = ["x", "y", "z"] as const;
const AXIS_VEC = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
] as const;

interface FaceSpec {
  face: CubeFace;
  axis: Axis;
  sign: Dir;
  normal: [number, number, number];
  rotation: [number, number, number];
}

// A PlaneGeometry faces +z, so each entry is the rotation that swings it onto
// its own face of the cubie.
const FACES: readonly FaceSpec[] = [
  { face: "right", axis: 0, sign: 1, normal: [1, 0, 0], rotation: [0, QUARTER, 0] },
  { face: "left", axis: 0, sign: -1, normal: [-1, 0, 0], rotation: [0, -QUARTER, 0] },
  { face: "up", axis: 1, sign: 1, normal: [0, 1, 0], rotation: [-QUARTER, 0, 0] },
  { face: "down", axis: 1, sign: -1, normal: [0, -1, 0], rotation: [QUARTER, 0, 0] },
  { face: "front", axis: 2, sign: 1, normal: [0, 0, 1], rotation: [0, 0, 0] },
  { face: "back", axis: 2, sign: -1, normal: [0, 0, -1], rotation: [0, Math.PI, 0] },
];

const PALETTES: Record<CubePalette, Record<CubeFace, string>> = {
  classic: {
    up: "#f4f4f2",
    down: "#ffd500",
    right: "#c41e3a",
    left: "#ff5800",
    front: "#009b48",
    back: "#0051ba",
  },
  amethyst: {
    up: "#f3e9ff",
    down: "#a855f7",
    right: "#7c3aed",
    left: "#d2abfd",
    front: "#5b21b6",
    back: "#2e1065",
  },
  mono: {
    up: "#fafafa",
    down: "#16161a",
    right: "#8a8a94",
    left: "#4a4a52",
    front: "#c9c9d1",
    back: "#2a2a30",
  },
  neon: {
    up: "#eafcff",
    down: "#ffe600",
    right: "#ff2d78",
    left: "#ff8a00",
    front: "#00ffa3",
    back: "#00c8ff",
  },
};

interface CubieSpec {
  key: string;
  coord: [number, number, number];
  stickers: { face: CubeFace; position: [number, number, number]; rotation: [number, number, number] }[];
}

// 27 cubies, each carrying a sticker only on the faces that actually point out
// of the cube: 24 on corners, 24 on edges, 6 on centres, 0 on the hidden core.
const CUBIES: readonly CubieSpec[] = (() => {
  const out: CubieSpec[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const stickers = FACES.filter((f) => (f.axis === 0 ? x : f.axis === 1 ? y : z) === f.sign).map(
          (f) => ({
            face: f.face,
            position: [f.normal[0] * 0.501, f.normal[1] * 0.501, f.normal[2] * 0.501] as [
              number,
              number,
              number,
            ],
            rotation: f.rotation,
          }),
        );
        out.push({ key: `${x}:${y}:${z}`, coord: [x, y, z], stickers });
      }
    }
  }
  return out;
})();

// Ease-out-back. The small overshoot past 90° and settle back is the mechanical
// click a real cube makes; a pure ease lands too softly to read as a click.
function easeTurn(t: number): number {
  const c1 = 1.12;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

function makeScramble(count: number, rng: () => number = Math.random): Move[] {
  const out: Move[] = [];
  let lastAxis = -1;
  for (let i = 0; i < count; i++) {
    let axis: Axis;
    do {
      axis = Math.floor(rng() * 3) as Axis;
    } while (axis === lastAxis);
    lastAxis = axis;
    out.push({
      axis,
      layer: (Math.floor(rng() * 3) - 1) as Layer,
      dir: rng() < 0.5 ? 1 : -1,
    });
  }
  return out;
}

function invert(moves: Move[]): Move[] {
  return moves
    .slice()
    .reverse()
    .map((m) => ({ axis: m.axis, layer: m.layer, dir: -m.dir as Dir }));
}

// mulberry32: a 32-bit seeded generator, good enough that a fixed seed
// reproduces one scramble across every visitor and every reload.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The scrubbed timeline: N seeded moves, then the same N inverted, so the
 *  playhead runs solved → scrambled → solved. */
function buildScrubSequence(count: number, seed: number): Move[] {
  const scramble = makeScramble(count, mulberry32(seed));
  return [...scramble, ...invert(scramble)];
}

// Light spilling from behind the cube, drawn as one camera-facing quad. A
// fresnel shell is the obvious idea here and it is the wrong one: a box has a
// constant normal per face, so 1 - dot(N, V) is uniform across each face and
// the shader can only ever draw a flat, hard-edged stroke around the
// silhouette. Fresnel needs curvature. A radial falloff in screen space has the
// gradient a box never will.
// vNdc is the fragment's position across the canvas (-1..1). Both quads project
// larger than the canvas at the tuned camera distance, so a falloff written in
// quad space is still lit where the canvas ends and the whole element reads as
// a hard-edged square of light over the page. Fading on the screen radius
// instead guarantees zero at the canvas edge whatever the camera does.
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vNdc;
void main() {
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vNdc = clip.xy / clip.w;
  gl_Position = clip;
}
`;
const SCREEN_FADE = /* glsl */ `
float screenFade(vec2 ndc) {
  return 1.0 - smoothstep(0.68, 0.97, length(ndc));
}
`;
// Two falloffs summed at one tint: a tighter inner term that concentrates light
// just past the silhouette, and a wide low skirt that survives to the edge of
// the quad. No white core — a white centre on an additive quad clips to pure
// white and reads as a lens flare bolted onto the cube rather than light coming
// off it.
//
// Alpha is written as 0, and the additive materials below are flagged
// premultipliedAlpha so three blends them ONE/ONE on every channel. Light is
// added to the colour buffer while the canvas's own alpha is left alone — on a
// `transparent` canvas an alpha of 1 here would turn every covered pixel into
// the opaque clear colour, and the whole quad shows up as a hard black square
// over the page.
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
varying vec2 vNdc;
${SCREEN_FADE}
void main() {
  float r = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
  float d = 1.0 - r;
  float a = pow(d, 2.6) * 0.8 + pow(d, 1.15) * 0.28;
  gl_FragColor = vec4(uColor * a * uIntensity * screenFade(vNdc), 0.0);
}
`;

// The shimmer: a band of light swept diagonally across every lacquered surface,
// patched into the physical materials rather than drawn as a quad, so it lands
// on the stickers and the body exactly where they are and nowhere else. The
// band lives in view space (vViewPosition), so it always crosses the cube
// corner to corner on screen whatever the orbit. A thin bright core inside a
// wide soft skirt: one gaussian alone reads as a stripe.
const SHEEN_HEAD = /* glsl */ `
uniform vec4 uSheen;
uniform vec3 uSheenColor;
`;
const SHEEN_BODY = /* glsl */ `
{
  float s = dot(vViewPosition.xy, normalize(vec2(1.0, 0.85)));
  float d = (s - uSheen.x) / max(uSheen.y, 0.001);
  float band = exp(-d * d) * 0.3 + exp(-d * d * 9.0) * 0.7;
  outgoingLight += uSheenColor * band * uSheen.z;
}
#include <opaque_fragment>
`;
/** Sweep extent in view units — a little past the cube's projected half-diagonal
 *  each way, so the band enters and leaves cleanly. */
const SHEEN_SPAN = 3.8;
const SHEEN_WIDTH = 1.15;
/** One unhurried sweep per period: the band takes most of it to cross, eased
 *  in and out, with its brightness rising and falling under a sine envelope
 *  so it arrives and leaves like light moving over lacquer, never a flash. */
const SHEEN_PERIOD_MS = 4200;
const SHEEN_SWEEP_FRACTION = 0.8;
interface SheenUniforms {
  uSheen: { value: THREE.Vector4 };
  uSheenColor: { value: THREE.Color };
}
function patchSheen(mat: THREE.MeshPhysicalMaterial, uniforms: SheenUniforms): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSheen = uniforms.uSheen;
    shader.uniforms.uSheenColor = uniforms.uSheenColor;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SHEEN_HEAD}`)
      .replace("#include <opaque_fragment>", SHEEN_BODY);
  };
  // The cache key is combined with the material's own parameters, so one
  // constant is enough to keep patched and unpatched programs apart.
  mat.customProgramCacheKey = () => "sg-sheen";
}

// How far the sticker's centre stands proud of its edge. The mesh is scaled
// uniformly by STICKER_SCALE, which scales z too, so the dome is shallower on
// screen than this number reads.
const DOME_HEIGHT = 0.08;

// Stickers are domed, not flat. A flat plane has one normal across its whole
// surface, so a specular highlight covers all of it or none of it — the sticker
// flashes rather than glints, and no amount of clearcoat makes that read as
// gloss. Curvature is what produces the moving highlight. Real cube stickers
// are slightly convex for the same reason.
function makeStickerGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, 20, 20);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.abs(pos.getX(i)) * 2;
    const y = Math.abs(pos.getY(i)) * 2;
    // Superellipse, not a Chebyshev max(|x|,|y|). Both hug the square edge, so
    // both keep the corners from sinking the way an inscribed circle would —
    // but Chebyshev's level sets are squares, which leaves the surface with a
    // derivative jump along each diagonal. computeVertexNormals bakes that in
    // as a crease, and a crease under a tight highlight is a starburst. The
    // squircle has the same silhouette with no jump anywhere.
    const r = Math.min(1, Math.pow(x ** 4 + y ** 4, 0.25));
    pos.setZ(i, Math.cos(r * Math.PI * 0.5) * DOME_HEIGHT);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// The studio's sky. A flat background colour is why a sticker either catches one
// of the cards below or goes black: every normal that misses them resolves to
// the same constant, so the face reads as a cliff rather than a falloff. A
// gradient gives every direction something to return.
const SKY_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
varying vec3 vPos;
void main() {
  float t = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
}
`;

// A three-strip studio, built here rather than imported from three's examples
// so the reflections can be coloured to the bench. Clearcoat only reads as wet
// lacquer if there is something to reflect — with lights alone it produces a
// few hard specular dots and the cube still looks like matte plastic.
function buildEnvScene(): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(1, 1);
  const mats: THREE.Material[] = [];
  const strip = (
    color: string,
    intensity: number,
    position: [number, number, number],
    scale: [number, number],
    lookAt: [number, number, number],
  ) => {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    mat.color.multiplyScalar(intensity);
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...position);
    mesh.scale.set(scale[0], scale[1], 1);
    mesh.lookAt(...lookAt);
    scene.add(mesh);
  };

  // Enclosing shell rather than more cards: cards leave gaps between them, and
  // the gaps were the problem. Radius clears the cards at ±8 comfortably.
  // Colours go in as uniforms so three converts the hex into its linear working
  // space — hand-packing a gradient texture invites a double sRGB conversion.
  //
  // Pick these by the light they carry, not by how they read as a swatch. sRGB
  // is steeply non-linear near black: a tasteful "dark sky" like #262633 sits at
  // 0.15 sRGB but ~0.018 linear, which is close enough to nothing that the bake
  // is indistinguishable from the flat background it replaced. Measured over six
  // orientations, #262633 moved the cube's near-black pixels 7.8% → 6.6%; the
  // values below move them to 2.7%.
  const skyGeo = new THREE.SphereGeometry(40, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color("#6e6e88") },
      uBottom: { value: new THREE.Color("#2c2c3a") },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // The key used to run at 7, which pinned the up face at pure white — nothing
  // rolls it off, since the renderer is `flat` and the stickers opt out of tone
  // mapping to keep their literal hex.
  strip("#ffffff", 5, [0, 8, 1], [11, 4], [0, 0, 0]);
  strip("#c9b8ff", 3.4, [-8, 1, 4], [3, 11], [0, 0, 0]);
  strip("#8fd0ff", 2.6, [8, -1, -4], [3, 11], [0, 0, 0]);
  // Floor bounce. No front card: the camera rests front-right-above, so a fill
  // there would flatten the contrast this scene exists to produce.
  strip("#7d8398", 1.1, [0, -7, -1], [10, 4], [0, 0, 0]);

  return {
    scene,
    dispose: () => {
      geo.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

// Owns scene.environment for the clearcoat to reflect. Separate component so
// the PMREM render happens once, off the prop path that re-runs every tune.
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = buildEnvScene();
    const target = pmrem.fromScene(env.scene, 0.04);
    scene.environment = target.texture;
    env.dispose();
    pmrem.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      target.texture.dispose();
    };
  }, [gl, scene, invalidate]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
    invalidate();
  }, [intensity, scene, invalidate]);

  return null;
}

// Halo tint per palette, so the atmosphere agrees with the stickers instead of
// staining a neon cube amethyst.
const GLOW_TINT: Record<CubePalette, string> = {
  classic: "#a855f7",
  amethyst: "#a855f7",
  mono: "#8b9cff",
  neon: "#00d9ff",
};

// Its own component with an unguarded frame callback: the quad has to keep
// facing the camera while the cube is paused, since orbiting a frozen cube is
// still allowed.
//
// The quad is parked BEHIND the cube along the view axis and keeps depth
// testing on. A transparent material renders after the opaque pass, so a quad
// sitting on the cube's own centre plane with depthTest off paints straight
// over the front faces — the light has to actually be behind the object for the
// cube to occlude it and leave only the spill around the silhouette.
function GlowHalo({ extent, tint }: { extent: number; tint: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          // Seeded neutral; the effect below owns the tint so this factory has
          // no prop dependency and never rebuilds the material on a palette flip.
          uColor: { value: new THREE.Color("#ffffff") },
          uIntensity: { value: 1.05 },
        },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => {
    mat.uniforms.uColor.value.set(tint);
  }, [tint, mat]);
  useEffect(() => {
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat]);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.quaternion.copy(state.camera.quaternion);
    mesh.position.copy(state.camera.position).normalize().multiplyScalar(-extent * 0.34);
  });
  return <mesh ref={ref} geometry={geo} material={mat} scale={extent} frustumCulled={false} />;
}

// Every legal cubie orientation is a signed permutation matrix, so rounding the
// rotation matrix is exact rather than approximate. Without this the float error
// from an endless run of turns accumulates until the cube visibly shears apart.
const _snapMatrix = new THREE.Matrix4();
function snapQuaternion(q: THREE.Quaternion): void {
  _snapMatrix.makeRotationFromQuaternion(q);
  const e = _snapMatrix.elements;
  for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]);
  q.setFromRotationMatrix(_snapMatrix);
}

// Click-drag orbit rig: eased azimuth, clamped elevation, radius easing toward
// the tuned distance. Elevation stops short of the poles — passing them flips
// the up vector and the cube tumbles sideways under the cursor. invalidate()
// keeps the demand frameloop (paused / reduced motion) painting while dragging.
function CameraRig({
  distance,
  onDrag,
  drive,
  orbitApi,
}: {
  distance: number;
  onDrag: (dx: number, dy: number, camera: THREE.Camera) => void;
  /** Host offsets added at position time, so a drag's own targets survive. */
  drive?: RefObject<CubeDrive>;
  /** Filled with the rig's re-aim so an external surface can drive it. */
  orbitApi?: RefObject<((dx: number, dy: number) => void) | null>;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const azimuth = useRef({ current: ORBIT_AZIMUTH, target: ORBIT_AZIMUTH });
  const elevation = useRef({
    current: ORBIT_ELEVATION,
    target: ORBIT_ELEVATION,
  });
  const radius = useRef(distance);
  const dragRef = useRef(onDrag);
  dragRef.current = onDrag;

  useEffect(() => invalidate(), [distance, invalidate]);

  // One re-aim for both the canvas's own drag and an external drag pad.
  const orbitBy = useCallback(
    (dx: number, dy: number) => {
      azimuth.current.target -= dx * 0.006;
      elevation.current.target = THREE.MathUtils.clamp(
        elevation.current.target + dy * 0.005,
        -1.35,
        1.35,
      );
      dragRef.current(dx, dy, camera);
      invalidate();
    },
    [camera, invalidate],
  );
  useEffect(() => {
    if (!orbitApi) return;
    orbitApi.current = orbitBy;
    return () => {
      orbitApi.current = null;
    };
  }, [orbitApi, orbitBy]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      orbitBy(dx, dy);
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl, orbitBy]);

  useFrame((state, delta) => {
    const az = azimuth.current;
    const el = elevation.current;
    const ease = Math.min(1, delta * 8);
    az.current += (az.target - az.current) * ease;
    el.current += (el.target - el.current) * ease;
    radius.current += (distance - radius.current) * ease;
    if (
      Math.abs(az.target - az.current) > 0.0004 ||
      Math.abs(el.target - el.current) > 0.0004 ||
      Math.abs(distance - radius.current) > 0.005
    ) {
      invalidate();
    }
    const r = radius.current;
    // Host offsets are applied here rather than folded into the targets, so a
    // drag and a scroll-driven drift compose instead of fighting over one
    // number. The pole clamp is re-applied after the add for the same reason.
    const azOut = az.current + (drive?.current.azimuth ?? 0);
    const elOut = THREE.MathUtils.clamp(
      el.current + (drive?.current.elevation ?? 0),
      -1.35,
      1.35,
    );
    const ce = Math.cos(elOut);
    state.camera.position.set(
      r * ce * Math.sin(azOut),
      r * Math.sin(elOut),
      r * ce * Math.cos(azOut),
    );
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

const _basisRight = new THREE.Vector3();
const _basisUp = new THREE.Vector3();
const _basisFwd = new THREE.Vector3();
const _swipeAxis = new THREE.Vector3();
const _spinDelta = new THREE.Quaternion();
const _moveQ = new THREE.Quaternion();

function CubeScene({
  autoRotate = true,
  rotationSpeed = 1,
  moveDuration = 380,
  scrambleMoveCount = 12,
  pauseBetweenCycles = 700,
  cameraDistance = 11,
  gap = 0.06,
  palette = "classic",
  colors,
  bodyColor = "#16161c",
  background = "#0b0d14",
  transparent = false,
  glossy = true,
  glow = false,
  paused = false,
  reducedMotion = false,
  scrub,
  drive,
  seek,
  orbitApi,
}: Omit<RubiksCubeProps, "className" | "ref" | "maxDpr" | "onReady"> & {
  drive: RefObject<CubeDrive>;
  seek: RefObject<{ t: number }>;
  orbitApi: RefObject<((dx: number, dy: number) => void) | null>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const halted = paused || reducedMotion;

  const spinRef = useRef<THREE.Group>(null);
  const rootRef = useRef<THREE.Group>(null);
  const pivotRef = useRef<THREE.Group>(null);
  const cubieRefs = useRef<(THREE.Group | null)[]>([]);

  // Live-tuned values read inside the frame, so a slider drag never re-seeds the
  // cube or interrupts a cycle mid-turn.
  const live = useRef({
    autoRotate,
    rotationSpeed,
    moveDuration,
    scrambleMoveCount,
    pauseBetweenCycles,
    gap,
    halted,
  });
  live.current = {
    autoRotate,
    rotationSpeed,
    moveDuration,
    scrambleMoveCount,
    pauseBetweenCycles,
    gap,
    halted,
  };

  // The logical cube: one integer coordinate per cubie. Every turn rewrites
  // these, and every position is written back out from them, so the rendered
  // pose can never drift away from the state.
  const coords = useRef<THREE.Vector3[]>(
    CUBIES.map((c) => new THREE.Vector3(c.coord[0], c.coord[1], c.coord[2])),
  );

  const sched = useRef<{
    mode: "scramble" | "solve";
    scramble: Move[];
    queue: Move[];
    active: Move | null;
    members: THREE.Object3D[];
    t: number;
    hold: number;
  }>({ mode: "scramble", scramble: [], queue: [], active: null, members: [], t: 0, hold: 0 });

  const spin = useRef({
    axis: new THREE.Vector3(0.32, 1, 0.16).normalize(),
    target: new THREE.Vector3(0.32, 1, 0.16).normalize(),
  });

  // Scrub mode. The sequence is the whole timeline; the bookkeeping tracks how
  // many of its moves are baked into `coords` and which one (if any) is
  // currently on loan to the pivot. Zero always means "the pose the cube had
  // when scrub mode began" — a host that wants it to mean "solved" mounts the
  // cube in scrub mode, as the traveler does.
  const scrubSeed = scrub?.seed;
  const sequence = useMemo(
    () =>
      scrubSeed === undefined
        ? null
        : buildScrubSequence(Math.max(1, Math.round(scrambleMoveCount)), scrubSeed),
    [scrubSeed, scrambleMoveCount],
  );
  const scrubRef = useRef<{
    committed: number;
    activeIndex: number;
    members: THREE.Object3D[];
  }>({ committed: 0, activeIndex: -1, members: [] });
  // The smoothed playhead the engine actually renders. `seek` is only the
  // host's target: at rest (target 0) the idle loop advances this itself, and
  // under scroll it eases toward the target so wheel gaps never stutter.
  const playhead = useRef<{
    t: number;
    hold: number;
    wrapping: boolean;
    /** True once a target has been seen; the first one is snapped to, not eased. */
    primed: boolean;
    /** Set while the idle cycle owns the playhead, so leaving it is detectable. */
    idle: boolean;
    /** Leaving idle mid-cycle: finish solving forward, or rewind, whichever is nearer. */
    handoff: "forward" | "back" | null;
  }>({ t: 0, hold: 0, wrapping: false, primed: false, idle: false, handoff: null });

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const planeGeo = useMemo(() => makeStickerGeometry(), []);
  useEffect(() => {
    return () => {
      boxGeo.dispose();
      planeGeo.dispose();
    };
  }, [boxGeo, planeGeo]);

  // One uniform set shared by every surface, written per frame from the drive.
  const sheen = useMemo<SheenUniforms>(
    () => ({
      uSheen: { value: new THREE.Vector4(-SHEEN_SPAN, SHEEN_WIDTH, 0, 0) },
      uSheenColor: { value: new THREE.Color("#ffffff") },
    }),
    [],
  );
  const plasticMat = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({ color: "#16161c", roughness: 0.68, metalness: 0.05 });
    patchSheen(mat, sheen);
    return mat;
  }, [sheen]);
  const faceMats = useMemo(() => {
    const out = {} as Record<CubeFace, THREE.MeshPhysicalMaterial>;
    for (const f of FACES) {
      // toneMapped off keeps the stickers at their literal hex. A tone-mapped
      // red on a near-black bench desaturates into brown long before it looks
      // like a Rubik's cube.
      out[f.face] = new THREE.MeshPhysicalMaterial({
        roughness: 0.38,
        metalness: 0,
        toneMapped: false,
      });
      patchSheen(out[f.face], sheen);
    }
    return out;
  }, [sheen]);
  useEffect(() => {
    return () => {
      plasticMat.dispose();
      for (const m of Object.values(faceMats)) m.dispose();
    };
  }, [plasticMat, faceMats]);

  useEffect(() => {
    plasticMat.color.set(bodyColor);
    invalidate();
  }, [bodyColor, plasticMat, invalidate]);

  /** Sweep clock in ms, wrapped every period. */
  const sheenClock = useRef(0);

  useEffect(() => {
    const scheme = PALETTES[palette] ?? PALETTES.classic;
    for (const f of FACES) {
      const hex = colors?.[f.face] ?? scheme[f.face];
      const mat = faceMats[f.face];
      mat.color.set(hex);
      // A floor of self-illumination even with glow off. A sticker facing away
      // from every light would otherwise fall to near-black, and half the cube
      // faces away at any moment. Scaling the emissive colour rather than
      // emissiveIntensity is the same product, and keeps this a method call on
      // a nested object instead of a write to the memoised material.
      mat.emissive.set(hex).multiplyScalar(glow ? 0.45 : 0.12);
    }
    invalidate();
  }, [palette, colors, glow, faceMats, invalidate]);

  // Clearcoat is the wet lacquer; iridescence is the oil film sitting on top of
  // it. Both are shader defines keyed on the value being non-zero, so a toggle
  // has to ask for a recompile rather than just writing the number.
  useEffect(() => {
    for (const f of FACES) {
      const mat = faceMats[f.face];
      mat.roughness = glossy ? 0.2 : 0.42;
      mat.clearcoat = glossy ? 1 : 0;
      mat.clearcoatRoughness = glossy ? 0.03 : 0.5;
      mat.iridescence = glossy ? 0.45 : 0;
      mat.iridescenceIOR = 1.32;
      mat.iridescenceThicknessRange = [130, 420];
      mat.needsUpdate = true;
    }
    plasticMat.roughness = glossy ? 0.42 : 0.68;
    plasticMat.clearcoat = glossy ? 0.7 : 0;
    plasticMat.clearcoatRoughness = glossy ? 0.22 : 0.5;
    plasticMat.needsUpdate = true;
    invalidate();
  }, [glossy, faceMats, plasticMat, invalidate]);

  // Positions come from the logical coordinates, never from JSX — declaring them
  // as props would let a re-render clobber whatever the last turn wrote. A cubie
  // currently on loan to the pivot is skipped; finalize rewrites it anyway.
  useEffect(() => {
    const step = 1 + gap;
    for (let i = 0; i < CUBIES.length; i++) {
      const obj = cubieRefs.current[i];
      if (!obj || obj.parent !== rootRef.current) continue;
      const c = coords.current[i];
      obj.position.set(c.x * step, c.y * step, c.z * step);
    }
    invalidate();
  }, [gap, invalidate]);

  const finalizeTurn = useCallback(() => {
    const s = sched.current;
    const move = s.active;
    const pivot = pivotRef.current;
    const root = rootRef.current;
    if (!move || !pivot || !root) return;

    // Land on the exact quarter-turn rather than whatever the ease produced.
    pivot.rotation[AXIS_KEY[move.axis]] = move.dir * QUARTER;
    pivot.updateMatrixWorld(true);
    for (const obj of s.members) root.attach(obj);
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);

    const step = 1 + live.current.gap;
    const angle = move.dir * QUARTER;
    for (const obj of s.members) {
      const index = obj.userData.cubieIndex as number;
      const c = coords.current[index];
      // Deriving the new coordinate from the same rotation that was rendered
      // keeps logic and pixels consistent by construction — a hand-written
      // permutation table can be wrong for one of the six cases and look right
      // for the other five.
      c.applyAxisAngle(AXIS_VEC[move.axis], angle);
      c.set(Math.round(c.x), Math.round(c.y), Math.round(c.z));
      obj.position.set(c.x * step, c.y * step, c.z * step);
      snapQuaternion(obj.quaternion);
    }

    s.members = [];
    s.active = null;
    s.t = 0;
  }, []);

  const startTurn = useCallback((move: Move) => {
    const s = sched.current;
    const pivot = pivotRef.current;
    if (!pivot) return;
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    s.members = [];
    for (let i = 0; i < CUBIES.length; i++) {
      const c = coords.current[i];
      const slot = move.axis === 0 ? c.x : move.axis === 1 ? c.y : c.z;
      if (slot !== move.layer) continue;
      const obj = cubieRefs.current[i];
      if (!obj) continue;
      // attach preserves the world transform, which is the whole reason this is
      // reparenting rather than hand-rolled matrix work.
      pivot.attach(obj);
      s.members.push(obj);
    }
    s.active = move;
    s.t = 0;
  }, []);

  // --- scrub mode ---------------------------------------------------------
  // Returns the active layer to the root at exactly its committed pose. The
  // pivot is zeroed first so `attach` (which preserves world transforms) lands
  // every cubie back where it was before the loan.
  const detachScrub = useCallback(() => {
    const S = scrubRef.current;
    const pivot = pivotRef.current;
    const root = rootRef.current;
    if (!pivot || !root) return;
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    const step = 1 + live.current.gap;
    for (const obj of S.members) {
      root.attach(obj);
      const c = coords.current[obj.userData.cubieIndex as number];
      obj.position.set(c.x * step, c.y * step, c.z * step);
      snapQuaternion(obj.quaternion);
    }
    S.members = [];
    S.activeIndex = -1;
  }, []);

  const attachScrub = useCallback((move: Move, index: number) => {
    const S = scrubRef.current;
    const pivot = pivotRef.current;
    if (!pivot) return;
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    S.members = [];
    for (let i = 0; i < CUBIES.length; i++) {
      const c = coords.current[i];
      const slot = move.axis === 0 ? c.x : move.axis === 1 ? c.y : c.z;
      if (slot !== move.layer) continue;
      const obj = cubieRefs.current[i];
      if (!obj) continue;
      pivot.attach(obj);
      S.members.push(obj);
    }
    S.activeIndex = index;
  }, []);

  // Bakes one whole quarter-turn into the cubies directly, forwards (+1) or
  // undone (-1): finalizeTurn's arithmetic applied to root children, with no
  // reparenting, so a fast wheel that skips several moves in one frame
  // commits them all at once. Premultiplying the world rotation is exactly
  // what a pivot turn followed by `attach` would have produced.
  const applyMove = useCallback((move: Move, sign: 1 | -1) => {
    const step = 1 + live.current.gap;
    const angle = sign * move.dir * QUARTER;
    _moveQ.setFromAxisAngle(AXIS_VEC[move.axis], angle);
    for (let i = 0; i < CUBIES.length; i++) {
      const c = coords.current[i];
      const slot = move.axis === 0 ? c.x : move.axis === 1 ? c.y : c.z;
      if (slot !== move.layer) continue;
      const obj = cubieRefs.current[i];
      if (!obj) continue;
      c.applyAxisAngle(AXIS_VEC[move.axis], angle);
      c.set(Math.round(c.x), Math.round(c.y), Math.round(c.z));
      obj.position.set(c.x * step, c.y * step, c.z * step);
      obj.quaternion.premultiply(_moveQ);
      snapQuaternion(obj.quaternion);
    }
  }, []);

  // The reversible playhead. Integer part = moves baked into the cube,
  // fraction = how far the next move has turned on the pivot. Crossing a
  // boundary in either direction is a commit or an uncommit; the loan is
  // returned whenever the active move changes or lands exactly on a boundary.
  const scrubTo = useCallback(
    (t: number) => {
      const seq = sequence;
      const pivot = pivotRef.current;
      if (!seq || !pivot) return;
      const total = seq.length;
      const target = Math.min(total, Math.max(0, t));
      let k = Math.floor(target);
      let f = target - k;
      if (k >= total) {
        k = total;
        f = 0;
      }
      const S = scrubRef.current;
      if (S.activeIndex !== -1 && (S.activeIndex !== k || f === 0)) detachScrub();
      while (S.committed < k) {
        applyMove(seq[S.committed], 1);
        S.committed++;
      }
      while (S.committed > k) {
        S.committed--;
        applyMove(seq[S.committed], -1);
      }
      if (f > 0) {
        const move = seq[k];
        if (S.activeIndex !== k) attachScrub(move, k);
        pivot.rotation[AXIS_KEY[move.axis]] = detent(f) * move.dir * QUARTER;
      }
    },
    [sequence, detachScrub, attachScrub, applyMove],
  );

  // Entering or leaving scrub mode hands the pivot over cleanly: the timer
  // loop's in-flight turn is completed, the scrub loan is returned, and the
  // playhead's zero is re-based on whatever pose the cube now holds.
  useEffect(() => {
    if (sched.current.active) finalizeTurn();
    detachScrub();
    scrubRef.current.committed = 0;
    playhead.current = { t: 0, hold: 0, wrapping: false, primed: false, idle: false, handoff: null };
    invalidate();
  }, [sequence, finalizeTurn, detachScrub, invalidate]);

  // A layer stopped at 43° reads as broken, so pausing completes the turn in
  // flight and freezes on a pose the cube could actually be in. In scrub mode
  // that is the nearest whole move.
  useEffect(() => {
    if (!halted) return;
    if (sequence) {
      const P = playhead.current;
      P.t = Math.round(P.t);
      scrubTo(P.t);
    } else if (sched.current.active) finalizeTurn();
    invalidate();
  }, [halted, sequence, scrubTo, finalizeTurn, invalidate]);

  const handleDrag = useCallback((dx: number, dy: number, camera: THREE.Camera) => {
    if (Math.hypot(dx, dy) < SWIPE_MIN) return;
    camera.matrixWorld.extractBasis(_basisRight, _basisUp, _basisFwd);
    // Drag right carries the front face right; drag down tips the top toward the
    // viewer. Direction only — like the black hole rig, the swipe never changes
    // how fast the cube spins, only where its axis points.
    _swipeAxis.copy(_basisUp).multiplyScalar(dx).addScaledVector(_basisRight, dy);
    if (_swipeAxis.lengthSq() < 1e-6) return;
    spin.current.target.copy(_swipeAxis).normalize();
  }, []);

  useFrame((_state, delta) => {
    const L = live.current;
    if (L.halted) return;
    const dt = Math.min(delta, 0.05);
    const D = drive.current;

    if (L.autoRotate && spinRef.current) {
      const st = spin.current;
      st.axis.lerp(st.target, Math.min(1, dt * AXIS_EASE));
      if (st.axis.lengthSq() < 1e-6) st.axis.copy(st.target);
      st.axis.normalize();
      _spinDelta.setFromAxisAngle(
        st.axis,
        BASE_SPIN * DEG * L.rotationSpeed * D.spinBoost * dt,
      );
      spinRef.current.quaternion.premultiply(_spinDelta);
    }

    // The sweep. Timed here, not by the host: one pass per period, strength
    // from the drive. Plain uniform writes shared by every surface.
    if (D.sheen > 0.001) {
      sheenClock.current = (sheenClock.current + dt * 1000) % SHEEN_PERIOD_MS;
      const phase = sheenClock.current / SHEEN_PERIOD_MS;
      const progress = Math.min(1, phase / SHEEN_SWEEP_FRACTION);
      // Quintic ease-in-out on the travel: slow to leave, slow to arrive.
      const eased =
        progress < 0.5
          ? 16 * progress ** 5
          : 1 - (-2 * progress + 2) ** 5 / 2;
      // Parked just past the far edge between sweeps, so it is off the cube.
      const x = -SHEEN_SPAN + eased * (2 * SHEEN_SPAN + 2 * SHEEN_WIDTH);
      const envelope = Math.sin(Math.PI * progress);
      sheen.uSheen.value.set(x, SHEEN_WIDTH, D.sheen * envelope, 0);
    } else if (sheen.uSheen.value.z !== 0) {
      sheen.uSheen.value.z = 0;
    }

    if (sequence) {
      const total = sequence.length;
      const half = total / 2;
      const target = Math.min(total, Math.max(0, seek.current.t));
      const P = playhead.current;
      // A mid-page load lands on its pose; only later targets are eased.
      if (!P.primed) {
        P.primed = true;
        P.t = target;
      }
      // Never faster than the cube's own turn, whatever the target asks. An
      // exponential ease alone covers a page-long jump in half a second, and
      // sixteen quarter-turns in half a second is a flurry, not a solve.
      const maxStep = (dt * 1000) / Math.max(1, L.moveDuration);
      const wrap = () => {
        scrubTo(total);
        scrubRef.current.committed = 0;
        P.t = 0;
      };
      const idle = P.idle ? target < IDLE_EXIT : target < IDLE_ENTER;
      if (idle) {
        // At rest the cube runs the original cycle, but along this same
        // timeline: scramble to the midpoint, hold, solve to the end, hold,
        // wrap. The end pose IS the start pose, so the wrap is invisible.
        P.idle = true;
        P.handoff = null;
        if (P.hold > 0) {
          P.hold -= dt * 1000;
          if (P.hold <= 0 && P.wrapping) {
            P.wrapping = false;
            wrap();
          }
        } else {
          const before = P.t;
          P.t += (dt * 1000) / Math.max(1, L.moveDuration);
          if (before < half && P.t >= half) {
            P.t = half;
            P.hold = L.pauseBetweenCycles;
          } else if (P.t >= total) {
            P.t = total;
            P.hold = L.pauseBetweenCycles;
            P.wrapping = true;
          }
        }
      } else {
        P.hold = 0;
        P.wrapping = false;
        // Leaving the idle cycle part-way: the scroll timeline starts from
        // solved, so get there by the shorter road — finish the solve if past
        // the midpoint, otherwise undo the scramble — at a legible pace, then
        // hand over. Easing straight to the target from, say, move twelve
        // would rewind the whole cycle in a blur.
        if (P.idle) {
          P.idle = false;
          if (P.t > 1e-3) P.handoff = P.t > half ? "forward" : "back";
        }
        if (P.handoff) {
          const goal = P.handoff === "forward" ? total : 0;
          const remaining = goal - P.t;
          if (Math.abs(remaining) <= maxStep) {
            if (P.handoff === "forward") wrap();
            else P.t = 0;
            P.handoff = null;
          } else {
            P.t += Math.sign(remaining) * maxStep;
          }
        } else {
          const step = (target - P.t) * (1 - Math.exp(-dt * SEEK_RATE));
          P.t += Math.max(-maxStep, Math.min(maxStep, step));
        }
      }
      scrubTo(P.t);
      return;
    }

    const s = sched.current;
    const pivot = pivotRef.current;
    if (!pivot) return;

    if (s.active) {
      s.t += (dt * 1000) / Math.max(1, L.moveDuration);
      if (s.t >= 1) {
        finalizeTurn();
      } else {
        pivot.rotation[AXIS_KEY[s.active.axis]] = easeTurn(s.t) * s.active.dir * QUARTER;
      }
    } else if (s.hold > 0) {
      s.hold -= dt * 1000;
    } else if (s.queue.length > 0) {
      startTurn(s.queue.shift() as Move);
    } else if (s.mode === "scramble" && s.scramble.length > 0) {
      // Solving is the scramble replayed backwards and negated — visually
      // identical to a solver, and none of the cost.
      s.mode = "solve";
      s.queue = invert(s.scramble);
      s.hold = L.pauseBetweenCycles;
    } else {
      s.mode = "scramble";
      s.scramble = makeScramble(Math.max(1, Math.round(L.scrambleMoveCount)));
      s.queue = s.scramble.slice();
      s.hold = s.scramble.length > 0 ? L.pauseBetweenCycles : 0;
    }
  });

  // Wide enough that the skirt still has somewhere to fade out well clear of
  // the cube's corners.
  const haloExtent = 3 * (1 + gap) * 3.6;

  return (
    <>
      <CameraRig
        distance={cameraDistance}
        onDrag={handleDrag}
        drive={drive}
        orbitApi={orbitApi}
      />
      {transparent ? null : <color attach="background" args={[background]} />}
      <StudioEnvironment intensity={glossy ? 1.25 : 0.55} />
      {glow ? (
        <GlowHalo extent={haloExtent} tint={GLOW_TINT[palette] ?? GLOW_TINT.classic} />
      ) : null}

      {/* Deliberately restrained: the studio environment carries most of the
          ambient. A flat ambientLight bright enough to lift the dark faces on
          its own leaves no dynamic range for a highlight to sit in, and gloss
          is read entirely from that contrast. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 7, 6]} intensity={2.1} />
      <directionalLight position={[-6, 2, 4]} intensity={0.85} color="#cfd6ff" />
      <directionalLight position={[-3, -5, -5]} intensity={0.7} color="#a855f7" />

      <group ref={spinRef}>
        <group ref={rootRef}>
          <group ref={pivotRef} />
          {CUBIES.map((cubie, i) => (
            <group
              key={cubie.key}
              ref={(el) => {
                if (el) el.userData.cubieIndex = i;
                cubieRefs.current[i] = el;
              }}
            >
              <mesh geometry={boxGeo} material={plasticMat} />
              {cubie.stickers.map((sticker) => (
                <mesh
                  key={sticker.face}
                  geometry={planeGeo}
                  material={faceMats[sticker.face]}
                  position={sticker.position}
                  rotation={sticker.rotation}
                  scale={STICKER_SCALE}
                />
              ))}
            </group>
          ))}
        </group>
      </group>
    </>
  );
}

// Reports when the canvas has been sized to actually fill its host, which is
// the only safe moment to show it. react-three-fiber's own size is the signal
// and it is reactive, so this needs no polling of its own — it re-runs whenever
// that measurement changes and compares it against the host.
function FitGate({
  hostRef,
  onFit,
}: {
  hostRef: { current: HTMLDivElement | null };
  onFit: () => void;
}) {
  const width = useThree((s) => s.size.width);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // offsetWidth, not getBoundingClientRect: the rect is the *transformed*
    // box, and a host scaled by its parent (the classic recede, the traveler
    // from its very first frame) would never measure within 2px of the
    // canvas's layout width — the fit would never fire and the cube would sit
    // at opacity 0 for the life of the page.
    const hostWidth = host.offsetWidth;
    if (hostWidth > 0 && Math.abs(width - hostWidth) <= 2) onFit();
  }, [width, hostRef, onFit]);
  return null;
}

// Signals the first drawn frame. useFrame runs inside the render loop, so this
// fires after the environment bake and the first paint — unlike a mount effect,
// which lands while the canvas is still blank.
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    onReady?.();
  });
  return null;
}

export default function RubiksCube({
  className,
  paused = false,
  reducedMotion = false,
  transparent = false,
  cameraDistance = 11,
  maxDpr = 1.75,
  onReady,
  ref,
  ...props
}: RubiksCubeProps) {
  // The handle's three channels, all refs: a host writes them per frame and the
  // scene reads them per frame, and React never hears about any of it.
  const drive = useRef<CubeDrive>({
    azimuth: 0,
    elevation: 0,
    spinBoost: 1,
    sheen: 0,
  });
  const seek = useRef({ t: 0 });
  const orbitApi = useRef<((dx: number, dy: number) => void) | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      seek: (t) => {
        seek.current.t = t;
      },
      setDrive: (next) => {
        Object.assign(drive.current, next);
      },
      orbitBy: (dx, dy) => orbitApi.current?.(dx, dy),
    }),
    [],
  );
  // Activity-hidden routers force-lose the WebGL context but keep the <canvas>
  // in the DOM; a lost canvas can never re-acquire a context, so we remount a
  // fresh canvas element by bumping the key on hide. Harmless on real unmount.
  //
  // Deliberately unconditional, and every cleverer version has been worse. A
  // webglcontextlost listener is detached by its own cleanup at the moment
  // hiding kills the context, so the loss goes unseen and the cube returns
  // permanently blank. Checking isContextLost() on the way back reads a flag the
  // browser sets asynchronously — still false on that frame — so recovery lands
  // a whole navigation late and the visit runs on a dead canvas. Holding the
  // renderer in state so both signals could be combined then re-ran the effect
  // with the dead renderer still in state, bumping on every pass: an unbounded
  // remount loop that dies with "Maximum update depth exceeded". Swapping every
  // time is cheap, total, and cannot loop. The cost it used to carry — a visibly
  // tiny cube on the way back — is the reveal's problem below, not this one's.
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  useEffect(() => () => setCanvasEpoch((e) => e + 1), []);
  const hostRef = useRef<HTMLDivElement>(null);

  // Reveal on a measured fit, never on a lifecycle callback. onCreated looks
  // like the right signal and is not: react-three-fiber configures the root as
  // soon as it has any non-zero measurement, so when the container has not
  // settled it configures at the canvas's own default 300x150, fires onCreated,
  // and the cube is revealed tiny before jumping to full size. Whether that
  // happens is pure timing, which is why it reproduces on one machine and not
  // another. Comparing the canvas's painted width against the host's is the one
  // claim that cannot be made too early.
  const [fitEpoch, setFitEpoch] = useState(-1);
  const fitted = fitEpoch === canvasEpoch;
  const markFitted = useCallback(() => setFitEpoch(canvasEpoch), [canvasEpoch]);

  const halted = paused || reducedMotion;

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative h-full w-full select-none [&_canvas]:cursor-grab [&_canvas]:touch-none [&_canvas:active]:cursor-grabbing",
        // Fade rather than reveal. Every swap lands a brand new element, so the
        // hidden state is its natural starting point and the transition runs
        // itself — no reset to sequence, and it covers a swap the host cannot
        // see. Keying this to the route would not: an Activity-restored page
        // comes back on the same pathname, so nothing there ever changes.
        // Both opacities are stated: they are one tailwind-merge class group,
        // and a bare presence/absence pair lets an incoming className drop the
        // one that happens to be last.
        "[&_canvas]:transition-opacity [&_canvas]:duration-700 [&_canvas]:ease-out",
        fitted ? "[&_canvas]:opacity-100" : "[&_canvas]:opacity-0",
        className,
      )}
    >
      <Canvas
        key={canvasEpoch}
        flat
        dpr={[1, maxDpr]}
        frameloop={halted ? "demand" : "always"}
        camera={{ position: orbitPosition(cameraDistance), fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        // R3F sizes itself from getBoundingClientRect, which reports the
        // *transformed* box, and re-measures on scroll by default. A CSS
        // transform on any ancestor therefore feeds its own scale back in: the
        // canvas is resized to the scaled rect, inside the element that already
        // scaled it, and shrinks again 50ms after every scroll. That re-measure
        // exists to keep the raycaster's offsets right while the page moves,
        // and nothing here raycasts — the orbit drag binds pointer events on
        // the canvas directly and reads client deltas. The ResizeObserver still
        // handles real layout changes, which is the only resize that is true.
        resize={{ scroll: false }}
      >
        <FitGate hostRef={hostRef} onFit={markFitted} />
        <ReadySignal onReady={onReady} />
        <CubeScene
          paused={paused}
          reducedMotion={reducedMotion}
          transparent={transparent}
          cameraDistance={cameraDistance}
          drive={drive}
          seek={seek}
          orbitApi={orbitApi}
          {...props}
        />
      </Canvas>
    </div>
  );
}
