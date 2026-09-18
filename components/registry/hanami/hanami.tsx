"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type HanamiWeather = "clear" | "breezy" | "overcast" | "storm";

export interface HanamiProps {
  /** Headline. An empty string removes the element. */
  title?: string;
  /** Supporting line under the headline. */
  subtitle?: string;
  /** Call-to-action label. An empty string removes the button. */
  ctaLabel?: string;
  /** Click handler for the call-to-action. */
  onCtaClick?: () => void;
  /** Branch sway and petal drift speed. */
  windSpeed?: number;
  /** Live falling-petal count (pooled, capped at 300). */
  fallingPetals?: number;
  /** Canopy fullness: 0 = bare branches, 1 = full blossom. */
  bloomAmount?: number;
  /** Bundles ambient light, fog density and a wind multiplier. */
  weather?: HanamiWeather;
  /** Compass direction the petals drift toward, degrees. */
  windDirection?: number;
  /** Orbit radius — how far the camera sits from the tree. */
  cameraDistance?: number;
  /** The camera sways sideways toward the pointer, easing back on leave. */
  parallax?: boolean;
  /** How far the sway carries, degrees of orbit at the frame edge. */
  parallaxStrength?: number;
  /** Freeze all motion and render a single static bloomed frame. */
  paused?: boolean;
  /** Settles the scene: static bloomed frame, copy rendered at rest. */
  reducedMotion?: boolean;
  className?: string;
}

const PETAL_POOL = 300;
const TREE_X = 1.7;
const TREE_Y = -0.24; // sink the root flare into the turf so the tree reads planted
const TREE_SCALE = 2.1; // model is ~2.2 units tall; scene wants ~4.5
const TREE_URL = "/models/sakura_tree-slim.glb";
const FIELD_URL = "/models/green_field.glb";

// One field tile's scaled footprint is ~16.8×16.6 world units; the step sits
// ~1.6 under it so adjacent tiles overlap and their alpha-cutout blade edges
// interleave instead of meeting at a visible seam — the model's border rows
// are sparse, so a thin overlap still shows the disc at grazing angles.
const FIELD_TILE_X = 15.2;
const FIELD_TILE_Z = 15.0;
// Negated local bbox centre (model spans x -7.7..2.8, z -6.9..3.5): shifting
// the clone by this puts the tile's true centre on the group origin, so yaw
// and mirroring pivot the footprint in place instead of swinging it away.
const FIELD_RECENTER: [number, number, number] = [2.45, 0, 1.7];
// World centre of the original single patch — tile (0,0) reproduces the
// exact turf the tree, lantern and contact shadows were placed on.
const FIELD_CENTER_X = 0.58;
const FIELD_CENTER_Z = -0.56;

const WEATHER: Record<
  HanamiWeather,
  { windMul: number; sky: string; ground: string; fogNear: number; fogFar: number; ambient: number; sun: number }
> = {
  clear: { windMul: 1, sky: "#ecdfdf", ground: "#b6c0a8", fogNear: 10, fogFar: 30, ambient: 1.0, sun: 0.9 },
  breezy: { windMul: 1.8, sky: "#e7dde2", ground: "#b1bba5", fogNear: 10, fogFar: 28, ambient: 0.95, sun: 0.85 },
  overcast: { windMul: 1.3, sky: "#ced2d6", ground: "#a6b09d", fogNear: 8, fogFar: 24, ambient: 0.75, sun: 0.55 },
  storm: { windMul: 3, sky: "#a9afb9", ground: "#97a193", fogNear: 6, fogFar: 18, ambient: 0.55, sun: 0.4 },
};

// Light tints multiplied over the petal material's base pink — per-petal
// variation. The base pink lives on the material itself so petals read pink
// even before instance colors upload.
const PETAL_COLORS = ["#ffffff", "#ffe4ef", "#f2cfdd", "#ffd3e2"];

// Shared endpoints for the weather blend: the grass tint lifts toward white,
// the horizon disc sinks toward the contact-shadow green.
const WHITE = new THREE.Color("#ffffff");
const DISC_SHADOW = new THREE.Color("#3f4a3a");

// Deterministic PRNG so petal seeding is identical on every mount.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3-step luminance ramp for MeshToonMaterial — the flat painterly banding.
function makeRamp(stops: number[]): THREE.DataTexture {
  const data = new Uint8Array(stops);
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// Soft radial alpha disc; squash < 1 flattens it into a petal shape.
function makeSoftAlpha(squash: number, feather = 0.55): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(size / 2, size / 2);
  ctx.scale(1, squash);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(feather, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(-size / 2, -size / (2 * squash), size, size / squash);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface PetalState {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  phase: Float32Array;
  speed: Float32Array;
  scale: Float32Array;
}

// Fixed pool, recycled forever — petals are never allocated at runtime.
function createPetalState(rng: () => number): PetalState {
  const n = PETAL_POOL;
  const state: PetalState = {
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    phase: new Float32Array(n), speed: new Float32Array(n), scale: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    // Scattered across the whole frame, mid-fall, for the static first frame.
    state.x[i] = -5.5 + rng() * 10;
    state.z[i] = -1.2 + rng() * 2.6;
    state.y[i] = 0.15 + rng() * 4.4;
    state.phase[i] = rng() * Math.PI * 2;
    state.speed[i] = 0.5 + rng();
    state.scale[i] = 0.8 + rng() * 0.8;
  }
  return state;
}

// Re-tint a GLTF texture toward the scene's dusty palette without losing its
// painted detail: desaturate, lift toward soft pink, then restore the original
// alpha channel. Composite ops run once per unique texture at load.
function makeTintedTexture(
  src: THREE.Texture,
  ops: { sat?: string; screen?: string },
): THREE.CanvasTexture {
  const img = src.image as HTMLImageElement | ImageBitmap;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  if (ops.sat) {
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = ops.sat;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (ops.screen) {
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = ops.screen;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = src.flipY;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  // Carry over the UV transform (KHR_texture_transform) — without it an
  // atlas-based texture samples the wrong region.
  tex.repeat.copy(src.repeat);
  tex.offset.copy(src.offset);
  tex.rotation = src.rotation;
  tex.center.copy(src.center);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// The sourced GLB tree: toon-ramped trunk (keeping its painted bark texture),
// unlit blossom clumps (keeping their petal textures — painterly, not PBR),
// bloom via progressive bush visibility, plus the recycled petal pool anchored
// to the bush cluster centers.
function BlossomTree({
  wind,
  windVec,
  bloomAmount,
  petalCount,
  paused,
  barkRamp,
  petalGeo,
  petalMat,
}: {
  wind: number;
  windVec: { x: number; z: number };
  bloomAmount: number;
  petalCount: number;
  paused: boolean;
  barkRamp: THREE.DataTexture;
  petalGeo: THREE.BufferGeometry;
  petalMat: THREE.Material;
}) {
  const gltf = useLoader(GLTFLoader, TREE_URL);
  const swayRef = useRef<THREE.Group>(null);
  const petalsRef = useRef<THREE.InstancedMesh>(null);
  const petalState = useRef<PetalState | null>(null);
  // Petals fade with bloom: 0 bloom = no blossoms left to shed, so the pool
  // eases to invisible; any bloom eases it back in.
  const petalFade = useRef(bloomAmount > 0 ? 1 : 0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const model = useMemo(() => {
    // Clone: the GLTF cache is shared across mounts; never mutate the original.
    const scene = gltf.scene.clone(true);
    const created: (THREE.Material | THREE.Texture)[] = [];
    const bushes: THREE.Object3D[] = [];
    const dusty = new Map<THREE.Texture, THREE.CanvasTexture>();
    const rng = mulberry32(31);
    const toneDark = new THREE.Color("#e2b7c9");
    const toneLight = new THREE.Color("#ffffff");
    scene.traverse((obj) => {
      if (obj.name.startsWith("bush")) bushes.push(obj);
      if (obj instanceof THREE.Mesh) {
        const old = obj.material as THREE.MeshStandardMaterial;
        if (old.name === "Material") {
          // Trunk: keep the painted bark texture (warm-lifted out of the mud),
          // add the toon banding.
          let tex: THREE.CanvasTexture | undefined;
          if (old.map) {
            tex = dusty.get(old.map);
            if (!tex) {
              tex = makeTintedTexture(old.map, { screen: "rgba(146, 92, 66, 0.4)" });
              dusty.set(old.map, tex);
              created.push(tex);
            }
          }
          const mat = new THREE.MeshToonMaterial({ map: tex ?? old.map, gradientMap: barkRamp });
          created.push(mat);
          obj.material = mat;
        } else if (old.map) {
          // Blossoms: unlit, texture re-tinted into the dusty palette, with a
          // slight per-clump tone so clusters read against each other.
          let tex = dusty.get(old.map);
          if (!tex) {
            tex = makeTintedTexture(old.map, { sat: "hsl(330, 32%, 60%)", screen: "rgba(255, 228, 238, 0.4)" });
            dusty.set(old.map, tex);
            created.push(tex);
          }
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            alphaTest: 0.27,
            side: THREE.DoubleSide,
            color: toneDark.clone().lerp(toneLight, rng()),
          });
          created.push(mat);
          obj.material = mat;
        }
      }
    });
    scene.updateMatrixWorld(true);
    // Densify: two jittered clones per clump triple the blossom-card count and
    // fill the air gaps the stock model leaves. The source parent chain
    // carries Sketchfab rotation/scale, so each clone bakes that chain into
    // its own transform and reparents to the scene root — jitter then happens
    // in predictable model space (clump verts are baked, so tiny yaw about the
    // trunk origin nudges a copy tangentially).
    const clones: THREE.Object3D[] = [];
    const yaw = new THREE.Matrix4();
    for (const b of bushes) {
      for (let k = 0; k < 2; k++) {
        const c = b.clone(true);
        c.applyMatrix4(b.parent!.matrixWorld);
        c.applyMatrix4(yaw.makeRotationY((rng() - 0.5) * 0.3));
        c.position.x += (rng() - 0.5) * 0.22;
        c.position.y += (rng() - 0.5) * 0.14 + 0.03;
        c.position.z += (rng() - 0.5) * 0.22;
        scene.add(c);
        clones.push(c);
      }
    }
    scene.updateMatrixWorld(true);
    // Seeded shuffle so the bloom slider hides clumps scattered across the
    // canopy instead of one whole spatial region; clones appended after so low
    // bloom sheds the extra layer first.
    for (let i = bushes.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bushes[i], bushes[j]] = [bushes[j], bushes[i]];
    }
    for (let i = clones.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [clones[i], clones[j]] = [clones[j], clones[i]];
    }
    bushes.push(...clones);
    // Bush translations are baked into vertices, so anchor petals to each
    // clump's bounding-box center (world coords: scaled + tree offset).
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    const anchors = bushes.map((b) => {
      box.setFromObject(b).getCenter(center);
      return new THREE.Vector3(
        center.x * TREE_SCALE + TREE_X,
        center.y * TREE_SCALE + TREE_Y,
        center.z * TREE_SCALE,
      );
    });
    return { scene, bushes, anchors, dispose: () => created.forEach((m) => m.dispose()) };
  }, [gltf, barkRamp]);
  useEffect(() => () => model.dispose(), [model]);

  // Bloom: progressively reveal blossom clumps; 0 = bare branches.
  useEffect(() => {
    const visible = Math.round(model.bushes.length * bloomAmount);
    model.bushes.forEach((b, i) => {
      b.visible = i < visible;
    });
  }, [model, bloomAmount]);

  useEffect(() => {
    const mesh = petalsRef.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < PETAL_POOL; i++) {
      mesh.setColorAt(i, color.set(PETAL_COLORS[i % PETAL_COLORS.length]));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The program may have compiled before instanceColor existed — force a
    // recompile so the instancing-color define is actually in the shader.
    (mesh.material as THREE.Material).needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const sway = paused ? 0 : 1;

    if (swayRef.current) {
      swayRef.current.rotation.z = Math.sin(t * 0.9) * 0.006 * (1 + wind * 0.3) * sway;
      swayRef.current.rotation.x = Math.sin(t * 0.7 + 1.3) * 0.004 * (1 + wind * 0.3) * sway;
    }

    const mesh = petalsRef.current;
    if (!mesh) return;
    if (!petalState.current) petalState.current = createPetalState(mulberry32(9001));
    const petals = petalState.current;
    // No bloom, no petals: ease the pool's opacity out (or back in), then stop
    // drawing entirely once fully faded. Paused (reduced motion) snaps instead.
    const fadeTarget = bloomAmount > 0 ? 1 : 0;
    if (paused) {
      petalFade.current = fadeTarget;
    } else {
      petalFade.current += (fadeTarget - petalFade.current) * Math.min(1, dt * 2.2);
      if (Math.abs(fadeTarget - petalFade.current) < 0.01) petalFade.current = fadeTarget;
      else state.invalidate();
    }
    (mesh.material as THREE.MeshBasicMaterial).opacity = petalFade.current;
    const liveCount = petalFade.current === 0 ? 0 : petalCount;
    mesh.count = liveCount;
    const anchors = model.anchors;
    for (let i = 0; i < liveCount; i++) {
      if (!paused) {
        petals.y[i] -= (0.35 + petals.speed[i] * 0.35) * (0.4 + wind * 0.1) * dt;
        petals.x[i] += windVec.x * wind * 0.18 * (0.5 + petals.speed[i] * 0.4) * dt;
        petals.z[i] += windVec.z * wind * 0.11 * (0.5 + petals.speed[i] * 0.4) * dt;
        if (petals.y[i] < 0.02 || Math.abs(petals.x[i]) > 11) {
          if (anchors.length && Math.random() < 0.65) {
            // Shed from a blossom clump.
            const a = anchors[(Math.random() * anchors.length) | 0];
            petals.x[i] = a.x + (Math.random() - 0.5) * 1.6;
            petals.z[i] = a.z + (Math.random() - 0.5) * 1.4;
            petals.y[i] = Math.max(1.8, a.y) + Math.random() * 1.2;
          } else {
            // Ambient drift entering from upwind, filling the whole frame.
            petals.x[i] = -5.5 + Math.random() * 10 - windVec.x * Math.random() * 3;
            petals.z[i] = -1.2 + Math.random() * 2.6;
            petals.y[i] = 2.5 + Math.random() * 2.5;
          }
        }
      }
      const swayX = Math.sin(t * 1.7 + petals.phase[i]) * (0.1 + wind * 0.035) * sway;
      dummy.position.set(petals.x[i] + swayX, petals.y[i], petals.z[i]);
      dummy.rotation.set(
        t * petals.speed[i] * 2.1 * sway + petals.phase[i],
        t * petals.speed[i] * 1.5 * sway + petals.phase[i] * 2,
        petals.phase[i] * 3,
      );
      const s = petals.scale[i];
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <group ref={swayRef} position={[TREE_X, TREE_Y, 0]} scale={TREE_SCALE}>
        <primitive object={model.scene} />
      </group>
      <instancedMesh
        ref={petalsRef}
        args={[petalGeo, petalMat, PETAL_POOL]}
        frustumCulled={false}
        renderOrder={3}
      />
    </>
  );
}

// The sourced voxel field, tamed into the scene: texture desaturated at load,
// weather ground color multiplied on top so it tracks the palette, flattened
// and sunk so its bumps read as turf under the tree — then tiled 3×3 so the
// meadow runs unbroken past every orbit angle at max camera distance, with
// fog owning everything beyond the rim. Node clones share the tinted
// materials and geometry buffers, so GPU memory and the retint stay 1×.
function GreenField({
  tint,
  grassMats,
}: {
  tint: string;
  grassMats: { current: THREE.MeshBasicMaterial[] };
}) {
  const gltf = useLoader(GLTFLoader, FIELD_URL);
  const model = useMemo(() => {
    const base = gltf.scene.clone(true);
    const created: (THREE.Material | THREE.Texture)[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];
    base.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const old = obj.material as THREE.MeshStandardMaterial;
        const tex = old.map ? makeTintedTexture(old.map, { sat: "hsl(100, 14%, 55%)" }) : null;
        if (tex) created.push(tex);
        // Mirror the source material's semantics: double-sided alpha cutout.
        const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.6, side: THREE.DoubleSide });
        created.push(mat);
        mats.push(mat);
        obj.material = mat;
      }
    });
    const tiles: { obj: THREE.Object3D; ix: number; iz: number }[] = [];
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        tiles.push({ obj: ix === 0 && iz === 0 ? base : base.clone(true), ix, iz });
      }
    }
    return { tiles, mats, dispose: () => created.forEach((r) => r.dispose()) };
  }, [gltf]);
  useEffect(() => () => model.dispose(), [model]);

  useEffect(() => {
    // Initial paint only — once registered, the WeatherRig owns this color
    // every frame (its useFrame write lands before the next paint).
    const c = new THREE.Color(tint).lerp(WHITE, 0.3);
    model.mats.forEach((m) => m.color.copy(c));
    grassMats.current = model.mats;
    return () => {
      grassMats.current = [];
    };
  }, [model, tint, grassMats]);

  // Checkerboard 180° yaw plus an x-mirror on the outer columns breaks the
  // repeat pattern; both are safe on a double-sided alpha-cutout material and
  // both stay deterministic so the demand-frameloop first frame is stable.
  // The per-tile y stagger (millimetres, unique per tile) keeps overlapping
  // base quads off each other's plane — coplanar overlap z-fights as pale
  // shimmering strips at grazing camera angles.
  return (
    <>
      {model.tiles.map(({ obj, ix, iz }) => (
        <group
          key={`${ix},${iz}`}
          position={[
            FIELD_CENTER_X + ix * FIELD_TILE_X,
            -0.18 - 0.002 * (ix + 1) - 0.005 * (iz + 1),
            FIELD_CENTER_Z + iz * FIELD_TILE_Z,
          ]}
          rotation={[0, ((ix + iz) & 1) ? Math.PI : 0, 0]}
          scale={[(ix & 1) ? -1.6 : 1.6, 0.45, 1.6]}
        >
          <group position={FIELD_RECENTER}>
            <primitive object={obj} />
          </group>
        </group>
      ))}
    </>
  );
}

// Weather is a crossfade, not a cut: sky, fog, ground and light all ease
// toward the active preset over ~0.6s. Current values live in a lazily
// seeded ref the loop owns (never React state), and every write happens in
// useFrame — BEFORE the next paint — so the instant jump the weather
// re-render commits to scene.background, the fog and the materials is
// overwritten and never reaches the screen. Paused (and reduced motion)
// snaps to the target in a single frame instead.
function WeatherRig({
  weather,
  paused,
  hemi,
  sun,
  discMat,
  grassMats,
}: {
  weather: HanamiWeather;
  paused: boolean;
  hemi: { current: THREE.HemisphereLight | null };
  sun: { current: THREE.DirectionalLight | null };
  discMat: { current: THREE.MeshBasicMaterial | null };
  grassMats: { current: THREE.MeshBasicMaterial[] };
}) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const live = useRef<{
    sky: THREE.Color;
    ground: THREE.Color;
    near: number;
    far: number;
    ambient: number;
    sun: number;
    tmp: THREE.Color;
    target: THREE.Color;
  } | null>(null);

  // A weather change must wake the demand frameloop; while paused the snap
  // then lands in that one frame.
  useEffect(() => invalidate(), [weather, invalidate]);

  useFrame((_, delta) => {
    const w = WEATHER[weather];
    let l = live.current;
    if (!l) {
      // Seeded from the mount-time weather so first paint starts on target.
      l = live.current = {
        sky: new THREE.Color(w.sky),
        ground: new THREE.Color(w.ground),
        near: w.fogNear,
        far: w.fogFar,
        ambient: w.ambient,
        sun: w.sun,
        tmp: new THREE.Color(),
        target: new THREE.Color(),
      };
    }
    const k = paused ? 1 : Math.min(1, delta * 2.4);
    l.target.set(w.sky);
    // Drift measured before the step so demand mode keeps rendering until
    // the blend lands.
    const drift =
      Math.abs(l.target.r - l.sky.r) +
      Math.abs(l.target.g - l.sky.g) +
      Math.abs(l.target.b - l.sky.b) +
      Math.abs(w.fogNear - l.near) / 20 +
      Math.abs(w.fogFar - l.far) / 20;
    l.sky.lerp(l.target, k);
    l.ground.lerp(l.target.set(w.ground), k);
    l.near += (w.fogNear - l.near) * k;
    l.far += (w.fogFar - l.far) * k;
    l.ambient += (w.ambient - l.ambient) * k;
    l.sun += (w.sun - l.sun) * k;

    scene.background = l.sky;
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(l.sky);
      fog.near = l.near;
      fog.far = l.far;
    }
    if (hemi.current) hemi.current.intensity = l.ambient * 1.15;
    if (sun.current) sun.current.intensity = l.sun * 0.7;
    if (discMat.current) discMat.current.color.copy(l.ground).lerp(DISC_SHADOW, 0.35);
    const grass = l.tmp.copy(l.ground).lerp(WHITE, 0.3);
    for (const m of grassMats.current) m.color.copy(grass);

    if (drift > 0.004) invalidate();
  });

  return null;
}

// Camera pivot and orbit geometry, derived from the reference framing.
const PIVOT = { x: 0.55, y: 2.15 };
const ORBIT_BASE = Math.atan2(-0.2 - PIVOT.x, 6.9);

// Click-drag orbit: horizontal-only, unclamped — a full circle around the
// scene. Eased toward the drag target each frame; invalidate() keeps the
// demand frameloop (reduced motion) rendering while the user drags. The
// orbit radius eases toward the tuned cameraDistance the same way.
// Parallax is the same axis at a whisper: the camera sways a few degrees
// toward the pointer and eases back to rest on leave. Horizontal only — the
// camera height never moves — and it yields to the drag, which owns the
// camera while a button is down.
function CameraRig({
  paused,
  parallax,
  swayDegrees,
  distance,
}: {
  paused: boolean;
  parallax: boolean;
  swayDegrees: number;
  distance: number;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const azimuth = useRef({ current: 0, target: 0 });
  const sway = useRef({ current: 0, target: 0 });
  const radius = useRef(distance);

  // Wake the demand frameloop when the tuned distance changes.
  useEffect(() => invalidate(), [distance, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) sway.current.target = ((e.clientX - r.left) / r.width) * 2 - 1;
        return;
      }
      azimuth.current.target -= (e.clientX - lastX) * 0.006;
      lastX = e.clientX;
      invalidate();
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const leave = () => {
      sway.current.target = 0;
    };
    // touch-action is styled via a class on the wrapper (CSS, not JS
    // mutation) — see the [&_canvas]: utility in Hanami below. The cursor
    // stays default on purpose: hero, not instrument.
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
    };
  }, [gl, invalidate]);

  useFrame((state, delta) => {
    const az = azimuth.current;
    const ease = Math.min(1, delta * 8);
    az.current += (az.target - az.current) * ease;
    radius.current += (distance - radius.current) * ease;
    // Parallax settles to rest when paused or disabled; the slower ease keeps
    // the sway drifting behind the pointer instead of tracking it rigidly.
    const swayGoal =
      paused || !parallax ? 0 : sway.current.target * swayDegrees * (Math.PI / 180);
    sway.current.current += (swayGoal - sway.current.current) * Math.min(1, delta * 3);
    if (
      Math.abs(az.target - az.current) > 0.0005 ||
      Math.abs(distance - radius.current) > 0.005 ||
      Math.abs(swayGoal - sway.current.current) > 0.0005
    ) {
      invalidate();
    }
    const a = ORBIT_BASE + az.current + sway.current.current;
    state.camera.position.set(PIVOT.x + radius.current * Math.sin(a), 1.9, radius.current * Math.cos(a));
    state.camera.lookAt(PIVOT.x, PIVOT.y, 0);
  });

  return null;
}

function HanamiScene({
  windSpeed = 3,
  fallingPetals = 129,
  bloomAmount = 0.85,
  weather = "clear",
  windDirection = 45,
  cameraDistance = 8,
  parallax = true,
  parallaxStrength = 4,
  paused = false,
}: Omit<HanamiProps, "className" | "title" | "subtitle" | "ctaLabel" | "onCtaClick" | "reducedMotion">) {
  const wx = WEATHER[weather];
  const wind = windSpeed * wx.windMul;

  // --- shared GPU resources -------------------------------------------------
  const resources = useMemo(() => {
    const barkRamp = makeRamp([130, 185, 235]);
    const stoneRamp = makeRamp([80, 150, 220]);
    const discAlpha = makeSoftAlpha(1, 0.4);
    const petalAlpha = makeSoftAlpha(0.55);

    const petalGeo = new THREE.PlaneGeometry(0.1, 0.066);
    const petalMat = new THREE.MeshBasicMaterial({
      color: "#d795b2",
      alphaMap: petalAlpha,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const stoneMat = new THREE.MeshToonMaterial({ color: "#5a5a60", gradientMap: stoneRamp });
    const glowMat = new THREE.MeshBasicMaterial({ color: "#ffd39b" });
    const groundPetalMat = new THREE.MeshBasicMaterial({
      color: "#e5b7ca",
      alphaMap: discAlpha,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    // Soft radial contact shadow — dense at the center, fading out. Hard-edged
    // low-opacity circles read as decals and leave the tree looking afloat.
    const shadowMat = new THREE.MeshBasicMaterial({
      color: "#3f4a3a",
      alphaMap: discAlpha,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    return {
      barkRamp, petalGeo, petalMat, stoneMat, glowMat, groundPetalMat, shadowMat,
      dispose() {
        petalGeo.dispose();
        [petalMat, stoneMat, glowMat, groundPetalMat, shadowMat].forEach((m) => m.dispose());
        [barkRamp, stoneRamp, discAlpha, petalAlpha].forEach((t) => t.dispose());
      },
    };
  }, []);
  useEffect(() => () => resources.dispose(), [resources]);

  const windVec = useMemo(() => {
    const rad = (windDirection * Math.PI) / 180;
    // 0° drifts toward screen-left (matches the reference's leftward wind).
    return { x: -Math.cos(rad), z: Math.sin(rad) };
  }, [windDirection]);

  // The disc shows through the blade cutouts at grazing angles, so it must
  // match the rendered turf, which the tinted texture darkens well below raw
  // wx.ground — biasing toward the shadow green makes every through-gap read
  // as soil in blade shadow instead of a bright slit. The fogged far rim
  // still blends into the sky regardless of the bias.
  const groundColor = useMemo(
    () => new THREE.Color(wx.ground).lerp(new THREE.Color("#3f4a3a"), 0.35),
    [wx.ground],
  );

  const petalCount = Math.max(0, Math.min(PETAL_POOL, Math.round(fallingPetals)));

  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const discMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const grassMatsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  return (
    <>
      <CameraRig
        paused={paused}
        parallax={parallax}
        swayDegrees={parallaxStrength}
        distance={cameraDistance}
      />
      <WeatherRig
        weather={weather}
        paused={paused}
        hemi={hemiRef}
        sun={sunRef}
        discMat={discMatRef}
        grassMats={grassMatsRef}
      />
      <color attach="background" args={[wx.sky]} />
      <fog attach="fog" args={[wx.sky, wx.fogNear, wx.fogFar]} />
      {/* Warm grey underside light — a green-tinted ground color here muddies
          the blossom shadows */}
      <hemisphereLight ref={hemiRef} args={["#fbf3f0", "#c0b2ae", wx.ambient * 1.15]} />
      <directionalLight
        ref={sunRef}
        position={[-2, 8, 6]}
        intensity={wx.sun * 0.7}
        color="#fff4ec"
      />

      {/* Everything visible waits behind ONE boundary. The disc, decals and
          lantern are procedural and would paint instantly — a lantern floating
          on shadow puddles over a bare disc while the GLBs stream in. Until
          the whole scene is ready the canvas is flat sky, identical to the
          root div's background, so loading reads as a still sky, not a flash. */}
      <Suspense fallback={null}>
        {/* Horizon disc: unlit so fog alone blends it into the sky */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[60, 48]} />
          <meshBasicMaterial ref={discMatRef} color={groundColor} />
        </mesh>

        <GreenField tint={wx.ground} grassMats={grassMatsRef} />
        <BlossomTree
          wind={wind}
          windVec={windVec}
          bloomAmount={bloomAmount}
          petalCount={petalCount}
          paused={paused}
          barkRamp={resources.barkRamp}
          petalGeo={resources.petalGeo}
          petalMat={resources.petalMat}
        />

        {/* Contact shadows + fallen-petal wash */}
      {/* Decals float just above the field's highest turf bumps */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TREE_X - 0.25, 0.065, 0.2]}
        material={resources.shadowMat}
      >
        <circleGeometry args={[2.3, 24]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TREE_X, 0.07, 0.15]}
        scale={[1.25, 1, 1]}
        material={resources.shadowMat}
      >
        <circleGeometry args={[0.85, 20]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-1.15, 0.07, 0.5]}
        material={resources.shadowMat}
      >
        <circleGeometry args={[0.5, 16]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TREE_X - 1, 0.075, 0.7]}
        material={resources.groundPetalMat}
      >
        <circleGeometry args={[1.5, 20]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0.2, 0.075, -0.4]}
        material={resources.groundPetalMat}
      >
        <circleGeometry args={[1, 20]} />
      </mesh>

      {/* Stone lantern (tōrō) with warm interior glow */}
      <group position={[-1.15, 0, 0.5]}>
        <mesh position={[0, 0.07, 0]} material={resources.stoneMat}>
          <boxGeometry args={[0.4, 0.14, 0.4]} />
        </mesh>
        <mesh position={[0, 0.45, 0]} material={resources.stoneMat}>
          <boxGeometry args={[0.11, 0.62, 0.11]} />
        </mesh>
        <mesh position={[0, 0.8, 0]} material={resources.stoneMat}>
          <boxGeometry args={[0.26, 0.07, 0.26]} />
        </mesh>
        {/* Firebox: warm emissive window faces, stone top/bottom */}
        <mesh
          position={[0, 0.93, 0]}
          material={[
            resources.glowMat, resources.glowMat,
            resources.stoneMat, resources.stoneMat,
            resources.glowMat, resources.glowMat,
          ]}
        >
          <boxGeometry args={[0.19, 0.2, 0.19]} />
        </mesh>
        <mesh position={[0, 1.12, 0]} rotation={[0, Math.PI / 4, 0]} material={resources.stoneMat}>
          <coneGeometry args={[0.3, 0.2, 4]} />
        </mesh>
        <mesh position={[0, 1.25, 0]} material={resources.stoneMat}>
          <sphereGeometry args={[0.04, 8, 8]} />
        </mesh>
        <pointLight position={[0, 0.95, 0]} color="#ffb066" intensity={0.7} distance={2.2} decay={2} />
      </group>
      </Suspense>
    </>
  );
}

// The copy's dark plum — sampled off the trunk so the type belongs to the
// scene at every weather, pale clear sky through storm grey.
const INK = "#3f3242";
const CTA_PINK = "#d795b2";

export default function Hanami({
  title,
  subtitle,
  ctaLabel,
  onCtaClick,
  weather = "clear",
  className,
  paused = false,
  reducedMotion = false,
  ...props
}: HanamiProps) {
  // Routers with preserved back/forward trees (Activity semantics) hide this
  // tree instead of unmounting it: effects clean up — R3F force-loses the WebGL
  // context — but the <canvas> element survives in the DOM. A canvas can never
  // acquire a second context after a forced loss, so on re-show we must mount a
  // brand-new canvas element. Bumping the key in the hide cleanup does exactly
  // that; on a real unmount the setState is a harmless no-op.
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  useEffect(() => () => setCanvasEpoch((e) => e + 1), []);

  const [fallback, setFallback] = useState(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
  useEffect(() => {
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) setFallback(true);
  }, []);

  // Reduced motion settles the whole scene: the R3F loop drops to demand and
  // the sway/petal integrators snap, exactly the paused path.
  const still = paused || reducedMotion;
  const wx = WEATHER[weather];

  // Copy rises in with a stagger; reduced motion renders the final state
  // immediately. Inline styles keep the entrance inside the pasted file.
  const rise = (i: number): React.CSSProperties =>
    reducedMotion
      ? {}
      : {
          opacity: entered ? 1 : 0,
          transform: entered ? "none" : "translateY(14px)",
          transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
        };

  // Dark ink on a pale scene — the inverse of the usual hero. The wash
  // gradient is a light veil, not a darkener, so storm stays legible without
  // muddying the clear-day pastels. The copy sits left in landscape (the tree
  // leans right of the pivot), at the bottom in portrait.
  const overlay = (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-end bg-[linear-gradient(0deg,rgba(241,231,233,0.6),rgba(241,231,233,0)_55%)] px-[max(20px,5.5cqi)] pb-[max(20px,6cqi)] text-left [@container(orientation:landscape)]:justify-center [@container(orientation:landscape)]:bg-[linear-gradient(90deg,rgba(241,231,233,0.55),rgba(241,231,233,0)_55%)] [@container(orientation:landscape)]:pb-0">
      {title ? (
        <h1
          className="max-w-[max(260px,44cqi)] text-[max(28px,5.4cqi)] leading-[1.02] font-semibold tracking-tight"
          style={{ ...rise(0), color: INK }}
        >
          {title}
        </h1>
      ) : null}
      {subtitle ? (
        <p
          className="mt-[max(10px,1.4cqi)] max-w-[max(220px,38cqi)] text-[max(12px,1.7cqi)] leading-snug"
          style={{ ...rise(1), color: `${INK}b3` }}
        >
          {subtitle}
        </p>
      ) : null}
      {ctaLabel && !reducedMotion ? (
        // The sheen sweeps once per hover: `forwards` parks it off the
        // right edge while hovered, and leaving drops the animation so
        // the inline transform resets it to the left for the next pass.
        // Scoped to the button's own hover on purpose — group-hover would
        // fire from any ancestor that carries `group`.
        <style>{`@keyframes __sg_hn_sheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.__sg_hn_cta:hover .__sg_hn_sheen, .__sg_hn_cta:focus-visible .__sg_hn_sheen { animation: __sg_hn_sheen 900ms cubic-bezier(0.4,0,0.2,1) forwards; }`}</style>
      ) : null}
      {ctaLabel ? (
        <button
          type="button"
          onClick={onCtaClick}
          className="__sg_hn_cta pointer-events-auto relative mt-[max(18px,2.6cqi)] cursor-pointer overflow-hidden rounded-full px-[max(22px,3cqi)] py-[max(11px,1.4cqi)] text-[max(11px,1.3cqi)] font-bold tracking-[0.2em] uppercase shadow-[0_14px_30px_-14px_rgba(63,50,66,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] transition-[transform,filter] duration-150 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f3242]/60 active:scale-95"
          style={{
            ...rise(2),
            color: INK,
            backgroundColor: CTA_PINK,
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 45%, rgba(63,50,66,0.1) 100%)",
          }}
        >
          <span
            aria-hidden
            className="__sg_hn_sheen pointer-events-none absolute inset-0"
            style={{
              transform: "translateX(-100%)",
              backgroundImage:
                "linear-gradient(105deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.35) 44%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.35) 56%, rgba(255,255,255,0) 70%)",
            }}
          />
          <span className="relative">{ctaLabel}</span>
        </button>
      ) : null}
    </div>
  );

  // No grab cursor: a hero reads as a page, not an instrument — the orbit is
  // a bonus for whoever tries it. touch-action stays, or a finger drag
  // scrolls the page instead of orbiting.
  // The CSS transition keeps the root's sky backdrop in step with the
  // WeatherRig's in-canvas blend when the weather changes.
  const rootClass = `relative h-full w-full overflow-hidden select-none @container-size transition-[background-color] duration-700 [&_canvas]:touch-none ${className ?? ""}`;

  if (fallback) {
    // No WebGL: the same copy over a flat rendition of the weather palette —
    // sky above a grass band, with a blush where the canopy would sit.
    return (
      <div
        className={rootClass}
        style={{
          backgroundImage: `radial-gradient(52% 44% at 64% 34%, #e8bccfb3 0%, transparent 70%), linear-gradient(180deg, ${wx.sky} 0%, ${wx.sky} 58%, ${wx.ground} 64%, ${wx.ground} 100%)`,
        }}
      >
        {overlay}
      </div>
    );
  }

  return (
    // The sky color sits on the root too: the canvas is transparent until the
    // GL context initializes, and a pale scene over a dark host page flashes
    // near-black on every load without it.
    <div className={rootClass} style={{ backgroundColor: wx.sky }}>
      <Canvas
        key={canvasEpoch}
        flat
        dpr={[1, 1.75]}
        frameloop={still ? "demand" : "always"}
        camera={{ position: [-0.2, 1.9, 6.9], fov: 45 }}
      >
        <HanamiScene weather={weather} paused={still} {...props} />
      </Canvas>
      {overlay}
    </div>
  );
}
