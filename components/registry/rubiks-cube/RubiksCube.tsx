"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type CubeFace = "up" | "down" | "right" | "left" | "front" | "back";
export type CubePalette = "classic" | "amethyst" | "mono" | "neon";

export interface RubiksCubeProps {
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
  /** Scene backdrop. */
  background?: string;
  /** Wet-lacquer clearcoat and a faint oil-slick sheen across the stickers. */
  glossy?: boolean;
  /** Emissive stickers plus an additive silhouette halo. */
  glow?: boolean;
  /** Freeze the spin and the solve loop, holding the current pose. */
  paused?: boolean;
  reducedMotion?: boolean;
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
// Degrees per second of ambient spin at rotationSpeed 1. Slow enough that the
// layer turns stay legible while the cube drifts underneath them.
const BASE_SPIN = 13;
// Pointer travel, in px, before a drag is allowed to re-aim the spin axis. Below
// this a resting hand's jitter would churn the axis every frame.
const SWIPE_MIN = 2;
// Rate the spin axis eases toward a swiped one — roughly a third of a second.
const AXIS_EASE = 3;
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

function makeScramble(count: number): Move[] {
  const out: Move[] = [];
  let lastAxis = -1;
  for (let i = 0; i < count; i++) {
    let axis: Axis;
    do {
      axis = Math.floor(Math.random() * 3) as Axis;
    } while (axis === lastAxis);
    lastAxis = axis;
    out.push({
      axis,
      layer: (Math.floor(Math.random() * 3) - 1) as Layer,
      dir: Math.random() < 0.5 ? 1 : -1,
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

// Light spilling from behind the cube, drawn as one camera-facing quad. A
// fresnel shell is the obvious idea here and it is the wrong one: a box has a
// constant normal per face, so 1 - dot(N, V) is uniform across each face and
// the shader can only ever draw a flat, hard-edged stroke around the
// silhouette. Fresnel needs curvature. A radial falloff in screen space has the
// gradient a box never will.
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// Two falloffs summed at one tint: a tighter inner term that concentrates light
// just past the silhouette, and a wide low skirt that survives to the edge of
// the quad. No white core — a white centre on an additive quad clips to pure
// white and reads as a lens flare bolted onto the cube rather than light coming
// off it.
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
  float d = 1.0 - r;
  float a = pow(d, 2.6) * 0.8 + pow(d, 1.15) * 0.28;
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
}
`;

// Stickers are domed, not flat. A flat plane has one normal across its whole
// surface, so a specular highlight covers all of it or none of it — the sticker
// flashes rather than glints, and no amount of clearcoat makes that read as
// gloss. Curvature is what produces the moving highlight. Real cube stickers
// are slightly convex for the same reason.
function makeStickerGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, 16, 16);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Chebyshev radius so the dome follows the square edge instead of a circle
    // inscribed in it, which would leave the corners visibly sunken.
    const r = Math.min(1, Math.max(Math.abs(x), Math.abs(y)) * 2);
    pos.setZ(i, Math.cos(r * Math.PI * 0.5) * 0.06);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

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

  scene.background = new THREE.Color("#0a0a10");
  strip("#ffffff", 7, [0, 8, 1], [11, 4], [0, 0, 0]);
  strip("#c9b8ff", 3.4, [-8, 1, 4], [3, 11], [0, 0, 0]);
  strip("#8fd0ff", 2.6, [8, -1, -4], [3, 11], [0, 0, 0]);

  return {
    scene,
    dispose: () => {
      geo.dispose();
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
}: {
  distance: number;
  onDrag: (dx: number, dy: number, camera: THREE.Camera) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const azimuth = useRef({ current: 0.7, target: 0.7 });
  const elevation = useRef({ current: 0.42, target: 0.42 });
  const radius = useRef(distance);
  const dragRef = useRef(onDrag);
  dragRef.current = onDrag;

  useEffect(() => invalidate(), [distance, invalidate]);

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
      azimuth.current.target -= dx * 0.006;
      elevation.current.target = THREE.MathUtils.clamp(
        elevation.current.target + dy * 0.005,
        -1.35,
        1.35,
      );
      lastX = e.clientX;
      lastY = e.clientY;
      dragRef.current(dx, dy, camera);
      invalidate();
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
  }, [gl, camera, invalidate]);

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
    const ce = Math.cos(el.current);
    state.camera.position.set(
      r * ce * Math.sin(az.current),
      r * Math.sin(el.current),
      r * ce * Math.cos(az.current),
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
  glossy = true,
  glow = false,
  paused = false,
  reducedMotion = false,
}: Omit<RubiksCubeProps, "className">) {
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

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const planeGeo = useMemo(() => makeStickerGeometry(), []);
  useEffect(() => {
    return () => {
      boxGeo.dispose();
      planeGeo.dispose();
    };
  }, [boxGeo, planeGeo]);

  const plasticMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: "#16161c", roughness: 0.68, metalness: 0.05 }),
    [],
  );
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
    }
    return out;
  }, []);
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
      mat.clearcoatRoughness = glossy ? 0.06 : 0.5;
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

  // A layer stopped at 43° reads as broken, so pausing completes the turn in
  // flight and freezes on a pose the cube could actually be in.
  useEffect(() => {
    if (!halted) return;
    if (sched.current.active) finalizeTurn();
    invalidate();
  }, [halted, finalizeTurn, invalidate]);

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

    if (L.autoRotate && spinRef.current) {
      const st = spin.current;
      st.axis.lerp(st.target, Math.min(1, dt * AXIS_EASE));
      if (st.axis.lengthSq() < 1e-6) st.axis.copy(st.target);
      st.axis.normalize();
      _spinDelta.setFromAxisAngle(st.axis, BASE_SPIN * DEG * L.rotationSpeed * dt);
      spinRef.current.quaternion.premultiply(_spinDelta);
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
      <CameraRig distance={cameraDistance} onDrag={handleDrag} />
      <color attach="background" args={[background]} />
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

export default function RubiksCube({
  className,
  paused = false,
  reducedMotion = false,
  ...props
}: RubiksCubeProps) {
  // Activity-hidden routers force-lose the WebGL context but keep the <canvas>
  // in the DOM; a lost canvas can never re-acquire a context, so we remount a
  // fresh canvas element by bumping the key on hide. Harmless on real unmount.
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  useEffect(() => () => setCanvasEpoch((e) => e + 1), []);
  const halted = paused || reducedMotion;

  return (
    <div
      className={cn(
        "relative h-full w-full select-none [&_canvas]:cursor-grab [&_canvas]:touch-none [&_canvas:active]:cursor-grabbing",
        className,
      )}
    >
      <Canvas
        key={canvasEpoch}
        flat
        dpr={[1, 1.75]}
        frameloop={halted ? "demand" : "always"}
        camera={{ position: [7, 4.9, 7], fov: 42 }}
        gl={{ antialias: true }}
      >
        <CubeScene paused={paused} reducedMotion={reducedMotion} {...props} />
      </Canvas>
    </div>
  );
}
