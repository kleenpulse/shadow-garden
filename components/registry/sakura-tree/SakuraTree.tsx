"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cn } from "@/lib/utils";

export type SakuraWeather = "clear" | "breezy" | "overcast" | "storm";

export interface SakuraTreeProps {
  /** Branch sway and petal drift speed. */
  windSpeed?: number;
  /** Live falling-petal count (pooled, capped at 300). */
  fallingPetals?: number;
  /** Canopy fullness: 0 = bare branches, 1 = full blossom. */
  bloomAmount?: number;
  /** Bundles ambient light, fog density and a wind multiplier. */
  weather?: SakuraWeather;
  /** Compass direction the petals drift toward, degrees. */
  windDirection?: number;
  /** Orbit radius — how far the camera sits from the tree. */
  cameraDistance?: number;
  /** Freeze all motion and render a single static bloomed frame. */
  paused?: boolean;
  className?: string;
}

const PETAL_POOL = 300;
const TREE_X = 1.7;
const TREE_SCALE = 2.1; // model is ~2.2 units tall; scene wants ~4.5
const TREE_URL = "/models/sakura_tree-slim.glb";
const FIELD_URL = "/models/green_field.glb";

const WEATHER: Record<
  SakuraWeather,
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
      return new THREE.Vector3(center.x * TREE_SCALE + TREE_X, center.y * TREE_SCALE, center.z * TREE_SCALE);
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
    mesh.count = petalCount;
    const anchors = model.anchors;
    for (let i = 0; i < petalCount; i++) {
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
      <group ref={swayRef} position={[TREE_X, 0.02, 0]} scale={TREE_SCALE}>
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
// and sunk so its bumps read as turf under the tree.
function GreenField({ tint }: { tint: string }) {
  const gltf = useLoader(GLTFLoader, FIELD_URL);
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const created: (THREE.Material | THREE.Texture)[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];
    scene.traverse((obj) => {
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
    return { scene, mats, dispose: () => created.forEach((r) => r.dispose()) };
  }, [gltf]);
  useEffect(() => () => model.dispose(), [model]);

  useEffect(() => {
    const c = new THREE.Color(tint).lerp(new THREE.Color("#ffffff"), 0.3);
    model.mats.forEach((m) => m.color.copy(c));
  }, [model, tint]);

  // Model spans x -7.7..2.8, z -6.9..3.5 — recenter under the stage.
  return (
    <group position={[4.5, -0.18, 2.16]} scale={[1.6, 0.45, 1.6]}>
      <primitive object={model.scene} />
    </group>
  );
}

// Camera pivot and orbit geometry, derived from the reference framing.
const PIVOT = { x: 0.55, y: 2.15 };
const ORBIT_BASE = Math.atan2(-0.2 - PIVOT.x, 6.9);

// Click-drag orbit: horizontal-only, unclamped — a full circle around the
// scene. Eased toward the drag target each frame; invalidate() keeps the
// demand frameloop (reduced motion) rendering while the user drags. The
// orbit radius eases toward the tuned cameraDistance the same way.
function CameraRig({ paused, distance }: { paused: boolean; distance: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const azimuth = useRef({ current: 0, target: 0 });
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
      if (!dragging) return;
      azimuth.current.target -= (e.clientX - lastX) * 0.006;
      lastX = e.clientX;
      invalidate();
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    // Cursor + touch-action are styled via classes on the wrapper (CSS, not
    // JS mutation) — see the [&_canvas]: utilities in SakuraTree below.
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
  }, [gl, invalidate]);

  useFrame((state, delta) => {
    const az = azimuth.current;
    const ease = Math.min(1, delta * 8);
    az.current += (az.target - az.current) * ease;
    radius.current += (distance - radius.current) * ease;
    if (Math.abs(az.target - az.current) > 0.0005 || Math.abs(distance - radius.current) > 0.005) {
      invalidate();
    }
    const a = ORBIT_BASE + az.current;
    const y = 1.9 + (paused ? 0 : state.pointer.y * 0.09);
    state.camera.position.set(PIVOT.x + radius.current * Math.sin(a), y, radius.current * Math.cos(a));
    state.camera.lookAt(PIVOT.x, PIVOT.y, 0);
  });

  return null;
}

function SakuraScene({
  windSpeed = 3,
  fallingPetals = 129,
  bloomAmount = 0.85,
  weather = "clear",
  windDirection = 45,
  cameraDistance = 7,
  paused = false,
}: Omit<SakuraTreeProps, "className">) {
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

    return {
      barkRamp, petalGeo, petalMat, stoneMat, glowMat, groundPetalMat,
      dispose() {
        petalGeo.dispose();
        [petalMat, stoneMat, glowMat, groundPetalMat].forEach((m) => m.dispose());
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

  const petalCount = Math.max(0, Math.min(PETAL_POOL, Math.round(fallingPetals)));

  return (
    <>
      <CameraRig paused={paused} distance={cameraDistance} />
      <color attach="background" args={[wx.sky]} />
      <fog attach="fog" args={[wx.sky, wx.fogNear, wx.fogFar]} />
      {/* Warm grey underside light — a green-tinted ground color here muddies
          the blossom shadows */}
      <hemisphereLight args={["#fbf3f0", "#c0b2ae", wx.ambient * 1.15]} />
      <directionalLight position={[-2, 8, 6]} intensity={wx.sun * 0.7} color="#fff4ec" />

      {/* Horizon disc: unlit so fog alone blends it into the sky */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[60, 48]} />
        <meshBasicMaterial color={wx.ground} />
      </mesh>

      <Suspense fallback={null}>
        <GreenField tint={wx.ground} />
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
      </Suspense>

      {/* Contact shadows + fallen-petal wash */}
      {/* Decals float just above the field's highest turf bumps */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TREE_X - 0.25, 0.07, 0.2]}>
        <circleGeometry args={[2.2, 24]} />
        <meshBasicMaterial color="#5f6a58" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.15, 0.07, 0.5]}>
        <circleGeometry args={[0.42, 16]} />
        <meshBasicMaterial color="#5f6a58" transparent opacity={0.18} depthWrite={false} />
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
    </>
  );
}

export default function SakuraTree({ className, paused = false, ...props }: SakuraTreeProps) {
  // Routers with preserved back/forward trees (Activity semantics) hide this
  // tree instead of unmounting it: effects clean up — R3F force-loses the WebGL
  // context — but the <canvas> element survives in the DOM. A canvas can never
  // acquire a second context after a forced loss, so on re-show we must mount a
  // brand-new canvas element. Bumping the key in the hide cleanup does exactly
  // that; on a real unmount the setState is a harmless no-op.
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  useEffect(() => () => setCanvasEpoch((e) => e + 1), []);

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
        frameloop={paused ? "demand" : "always"}
        camera={{ position: [-0.2, 1.9, 6.9], fov: 45 }}
      >
        <SakuraScene paused={paused} {...props} />
      </Canvas>
    </div>
  );
}
