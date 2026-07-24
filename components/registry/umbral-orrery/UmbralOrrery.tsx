"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface UmbralOrreryProps {
  /** Number of orbiting moons (1–6) that cross the sun↔planet line. */
  moonCount?: number;
  /** Angular speed multiplier for the moon orbits. */
  orbitSpeed?: number;
  /** Intensity of the central sun's shadow-casting light. */
  sunIntensity?: number;
  /** Inclination of the moon orbital plane, radians. */
  tilt?: number;
  /** Radius of the shadowed planet. */
  planetSize?: number;
  /** Radius of each orbiting moon. */
  moonSize?: number;
  /** Hex color of the emissive sun and its light. */
  sunColor?: string;
  /** Hex color of the planet's fresnel rim glow. */
  glowColor?: string;
  /** Orbit radius the camera eases toward. */
  cameraDistance?: number;
  /** Deep-space backdrop color. */
  background?: string;
  /** Freeze the orbit at the current pose. */
  paused?: boolean;
  className?: string;
}

// Scene geometry constants — sun at the origin, planet parked down +x so a
// perpendicular camera watches moons transit the sun↔planet gap.
const SUN_RADIUS = 1.15;
const PLANET_DIST = 5;
const TAU = Math.PI * 2;

// Deterministic PRNG so moon seeding is identical on every mount.
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

// World-space fresnel — bright at the silhouette, transparent face-on.
// Additive, depth-write off: a robust rim/halo shell with no lighting deps.
const FRESNEL_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewW = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRESNEL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormalW;
varying vec3 vViewW;
void main() {
  float f = 1.0 - clamp(dot(normalize(vNormalW), normalize(vViewW)), 0.0, 1.0);
  f = pow(f, uPower);
  gl_FragColor = vec4(uColor * uIntensity * f, 1.0);
}
`;

function makeFresnel(color: string, power: number, intensity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    vertexShader: FRESNEL_VERT,
    fragmentShader: FRESNEL_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// The orbiting moons. Live-tuned props (speed, tilt, sizes, paused) are stashed
// in a ref read INSIDE useFrame so a slider drag never re-seeds the orbits or
// rebuilds meshes — only moonCount is structural. Each moon's phase/speed/radius
// offset is seeded once per count, so tilt/size drags never jump the poses.
function Moons({
  count,
  moonSize,
  planetSize,
  orbitSpeed,
  tilt,
  paused,
  geo,
  mat,
}: {
  count: number;
  moonSize: number;
  planetSize: number;
  orbitSpeed: number;
  tilt: number;
  paused: boolean;
  geo: THREE.SphereGeometry;
  mat: THREE.Material;
}) {
  const meshesRef = useRef<(THREE.Mesh | null)[]>([]);
  const anglesRef = useRef<number[]>([]);
  const live = useRef({ orbitSpeed, tilt, planetSize, moonSize, paused });
  live.current.orbitSpeed = orbitSpeed;
  live.current.tilt = tilt;
  live.current.planetSize = planetSize;
  live.current.moonSize = moonSize;
  live.current.paused = paused;

  const seed = useMemo(() => {
    const rng = mulberry32(count * 131 + 17);
    return Array.from({ length: count }, (_, i) => ({
      phase: rng() * TAU,
      // Mixed prograde/retrograde so moons drift out of phase and can eclipse
      // one another as well as the planet.
      speed: (0.55 + rng() * 0.85) * (rng() > 0.5 ? 1 : -1),
      rOffset: i * 0.5,
      inclJitter: (rng() - 0.5) * 0.55,
    }));
  }, [count]);

  useEffect(() => {
    anglesRef.current = seed.map((s) => s.phase);
    meshesRef.current.length = count;
  }, [seed, count]);

  useFrame((state, delta) => {
    const L = live.current;
    const dt = Math.min(delta, 0.05);
    const angles = anglesRef.current;
    let moving = false;
    for (let i = 0; i < count; i++) {
      if (!L.paused) {
        angles[i] += seed[i].speed * L.orbitSpeed * dt;
        moving = true;
      }
      const mesh = meshesRef.current[i];
      if (!mesh) continue;
      const a = angles[i];
      const R = L.planetSize + L.moonSize + 0.85 + seed[i].rOffset;
      const incl = L.tilt + seed[i].inclJitter;
      const sinA = Math.sin(a);
      // a = 0 → moon at (-R, 0, 0) relative to the planet, i.e. squarely between
      // the sun (origin) and the planet — the eclipse pose.
      mesh.position.set(
        PLANET_DIST - R * Math.cos(a),
        R * sinA * Math.sin(incl),
        R * sinA * Math.cos(incl),
      );
      mesh.scale.setScalar(L.moonSize);
    }
    // Keep the demand frameloop alive while orbiting so a paused→playing flip
    // (or an easing camera) resolves smoothly.
    if (moving) state.invalidate();
  });

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshesRef.current[i] = el;
          }}
          geometry={geo}
          material={mat}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}

// Click-drag orbit rig: eased azimuth + clamped elevation, radius easing toward
// the tuned cameraDistance. Pointer-captured; invalidate() keeps the demand
// frameloop (paused / reduced motion) rendering while the user drags.
const PIVOT = new THREE.Vector3(PLANET_DIST * 0.62, 0, 0);

function CameraRig({ distance }: { distance: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const azimuth = useRef({ current: 0, target: 0 });
  const elevation = useRef({ current: 0.26, target: 0.26 });
  const radius = useRef(distance);

  useEffect(() => invalidate(), [distance, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      azimuth.current.target -= (e.clientX - lastX) * 0.006;
      elevation.current.target = THREE.MathUtils.clamp(
        elevation.current.target + (e.clientY - lastY) * 0.005,
        -1.2,
        1.2,
      );
      lastX = e.clientX;
      lastY = e.clientY;
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
  }, [gl, invalidate]);

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
      PIVOT.x + r * ce * Math.sin(az.current),
      PIVOT.y + r * Math.sin(el.current),
      PIVOT.z + r * ce * Math.cos(az.current),
    );
    state.camera.lookAt(PIVOT);
  });

  return null;
}

function OrreryScene({
  moonCount = 3,
  orbitSpeed = 0.6,
  sunIntensity = 2.2,
  tilt = 0.35,
  planetSize = 1.1,
  moonSize = 0.32,
  sunColor = "#ffcf6e",
  glowColor = "#a855f7",
  cameraDistance = 9,
  background = "#05060a",
  paused = false,
}: Omit<UmbralOrreryProps, "className">) {
  const count = Math.max(1, Math.min(6, Math.round(moonCount)));

  // Unit sphere shared by sun/planet/moons — meshes scale it, so size sliders
  // never rebuild geometry (or the GL context).
  const geo = useMemo(() => new THREE.SphereGeometry(1, 48, 48), []);
  useEffect(() => () => geo.dispose(), [geo]);

  const moonMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8b8fa6", roughness: 0.9, metalness: 0.05 }),
    [],
  );
  useEffect(() => () => moonMat.dispose(), [moonMat]);

  const rimMat = useMemo(() => makeFresnel(glowColor, 3.2, 1.15), []);
  const coronaMat = useMemo(() => makeFresnel(sunColor, 2.1, 1.5), []);
  useEffect(() => {
    rimMat.uniforms.uColor.value.set(glowColor);
  }, [glowColor, rimMat]);
  useEffect(() => {
    coronaMat.uniforms.uColor.value.set(sunColor);
  }, [sunColor, coronaMat]);
  useEffect(
    () => () => {
      rimMat.dispose();
      coronaMat.dispose();
    },
    [rimMat, coronaMat],
  );

  // Static starfield — a fixed shell of points, no animation, so it stays
  // correct while the orrery is paused.
  const stars = useMemo(() => {
    const n = 900;
    const pos = new Float32Array(n * 3);
    const rng = mulberry32(4201);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * TAU;
      const r = 40 + rng() * 30;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: "#c9b8e8",
      size: 0.14,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    return { g, m };
  }, []);
  useEffect(
    () => () => {
      stars.g.dispose();
      stars.m.dispose();
    },
    [stars],
  );

  return (
    <>
      <CameraRig distance={cameraDistance} />
      <color attach="background" args={[background]} />

      {/* Faint amethyst fill so the umbra reads dark but not pure black. */}
      <ambientLight intensity={0.13} color="#b98bff" />

      <points geometry={stars.g} material={stars.m} frustumCulled={false} />

      {/* Central sun — emissive core, shadow-casting light, additive corona. */}
      <group>
        <mesh geometry={geo} scale={SUN_RADIUS}>
          <meshStandardMaterial
            color="#000000"
            emissive={sunColor}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={geo} scale={SUN_RADIUS * 1.45} material={coronaMat} renderOrder={2} />
        <pointLight
          color={sunColor}
          intensity={sunIntensity}
          decay={0}
          distance={0}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0006}
          shadow-camera-near={0.4}
          shadow-camera-far={45}
        />
      </group>

      {/* The shadowed planet + amethyst fresnel rim shell. */}
      <group position={[PLANET_DIST, 0, 0]}>
        <mesh geometry={geo} scale={planetSize} castShadow receiveShadow>
          <meshStandardMaterial color="#2b2740" roughness={0.85} metalness={0.06} />
        </mesh>
        <mesh geometry={geo} scale={planetSize * 1.015} material={rimMat} renderOrder={3} />
      </group>

      <Moons
        count={count}
        moonSize={moonSize}
        planetSize={planetSize}
        orbitSpeed={orbitSpeed}
        tilt={tilt}
        paused={paused}
        geo={geo}
        mat={moonMat}
      />
    </>
  );
}

export default function UmbralOrrery({
  className,
  paused = false,
  ...props
}: UmbralOrreryProps) {
  // Activity-hidden routers force-lose the WebGL context but keep the <canvas>
  // in the DOM; a lost canvas can never re-acquire a context, so we remount a
  // fresh canvas element by bumping the key on hide. Harmless on real unmount.
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
        shadows
        dpr={[1, 1.75]}
        frameloop={paused ? "demand" : "always"}
        camera={{ position: [PIVOT.x, 2, 9], fov: 42 }}
        gl={{ antialias: true }}
      >
        <OrreryScene paused={paused} {...props} />
      </Canvas>
    </div>
  );
}
