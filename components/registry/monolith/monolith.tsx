"use client";

import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// A hero-sized moment: one monumental slab, hovering over an endless grid
// floor, with haze burning behind it. Built on three.js — a real
// PerspectiveCamera orbiting a real target beats hand-rolled clip-space math:
// the near-plane clipping, the depth sort and the projection are all correct
// by construction, and the slab gets a lit PBR material instead of a
// hand-mixed fragment color.
//
// Camera model: the eye sits on a sphere around a point just above the slab
// (theta = azimuth, phi = polar). phi is CLAMPED to a band just above the
// horizon — the visitor can circle the monolith but never dive under the
// floor or flip over the top, which is what keeps the composition a hero and
// not a Rubik's-cube inspector. Drag down = camera rises = look down more.
// The default rests near the LOW end of the band: a camera close to eye level
// drops the grid's far edge low in frame and hands most of it to the sky.
//
// The seam — a hairline of unlit light down the front face — is the focal
// point the whole composition hangs on. It is a child of the slab, so it
// bobs with it.
export interface MonolithProps {
	/** Base stone color of the slab. */
	slabColor?: string;
	/** Fresnel edge light on the slab. */
	rimColor?: string;
	/** Color of the sun and the tint it throws on the slab. */
	sunColor?: string;
	/** Show the sun. Off leaves the sky to the stars. */
	sun?: boolean;
	/** Sky and fog color. */
	backgroundColor?: string;
	/** Idle yaw rate while nothing is held. */
	spinSpeed?: number;
	/** Vertical bob amplitude. */
	floatAmp?: number;
	/** Slab size multiplier — 1 is the shipped minimum. */
	scale?: number;
	/** Camera distance multiplier. */
	zoom?: number;
	/** Resume idle rotation when the drag ends. */
	autoSpin?: boolean;
	/** The view leans toward the pointer, grid-horizon style. */
	parallax?: boolean;
	/** Halt the loop. The scene freezes mid-drift. */
	paused?: boolean;
	/** Settles the scene: no spin, no bob, one painted frame. */
	reducedMotion?: boolean;
	className?: string;
}

const RADIUS = 8.4;
/** Polar band: a hair above eye level to a comfortable high angle. Never below
 *  the floor line, never top-down — the scene stays a hero from every angle
 *  the visitor can reach. The camera RESTS at PHI_MAX (just under pi/2), so the
 *  grid recedes low and level by default; the parallax lean and drag travel
 *  upward through the band, and the downward lean saturates at rest. */
const PHI_MIN = 1.08;
const PHI_MAX = 1.56;

const Monolith = memo(
	({
		slabColor = "#241d3e",
		rimColor = "#a855f7",
		sunColor = "#4c1d95",
		sun = false,
		backgroundColor = "#05040a",
		spinSpeed = 0.03,
		floatAmp = 0.08,
		scale = 1,
		zoom = 1,
		autoSpin = true,
		parallax = false,
		paused = false,
		reducedMotion = false,
		className,
	}: MonolithProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: { width: number; height: number; dpr: number }) => void) | null>(
			null,
		);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
			null,
		);
		// Orbit state in a ref, written from the loop — React state would re-render
		// per pointer tick and the pause assertion in verify:loop would fail.
		const orbit = useRef({
			theta: 0,
			phi: PHI_MAX,
			vTheta: 0,
			vPhi: 0,
			dragging: false,
			pointerId: -1,
			lastX: 0,
			lastY: 0,
			lastT: 0,
		});
		const [fallback, setFallback] = useState(false);
		const pausedRef = useRef(paused);
		pausedRef.current = paused;
		// Parallax steering target, eased in the loop — same shape as
		// grid-horizon's vanishing-point pointer.
		const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

		const loop = useAnimationLoop({
			target: containerRef,
			halted: paused,
			dpr: "auto",
			onResize: (metrics) => measureRef.current?.(metrics),
			onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
			gl: () => glRef.current,
		});

		const live = useRef({
			slabColor, rimColor, sunColor, sun, backgroundColor,
			spinSpeed, floatAmp, scale, zoom, autoSpin, parallax, reducedMotion,
		});
		live.current = {
			slabColor, rimColor, sunColor, sun, backgroundColor,
			spinSpeed, floatAmp, scale, zoom, autoSpin, parallax, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: THREE.WebGLRenderer;
			try {
				renderer = new THREE.WebGLRenderer({
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
				});
			} catch {
				setFallback(true);
				return;
			}
			const glc = renderer.getContext();
			glRef.current = glc;

			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 1.15;
			const canvas = renderer.domElement;
			canvas.style.display = "block";
			canvas.style.position = "absolute";
			canvas.style.top = "0";
			canvas.style.left = "0";
			container.appendChild(canvas);

			const scene = new THREE.Scene();
			scene.background = new THREE.Color(backgroundColor);
			const target = new THREE.Vector3(0, 0.35, 0);

			const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);

			// ── Lighting ────────────────────────────────────────────────────────
			// Key + rim are CHILDREN OF THE CAMERA: the rig is fixed relative to
			// the viewer, so orbiting (or the idle spin) changes the view, never
			// the lighting — the slab stays illuminated from every angle it
			// spins to. The sun light rides the camera too, aimed from the sun's
			// bearing (placeSun), so the faces turned toward it pick up its tint
			// realistically. The hemisphere is ambient and stays world-fixed.
			const hemi = new THREE.HemisphereLight(
				new THREE.Color(sunColor),
				new THREE.Color("#0a0812"),
				0.7,
			);
			const key = new THREE.DirectionalLight(0xffffff, 2.2);
			key.position.set(2.5, 3, 2);
			const back = new THREE.DirectionalLight(new THREE.Color(rimColor), 1.4);
			back.position.set(-2.5, 2, -4);
			// A distant, dim sun tints the slab only faintly.
			const glowLight = new THREE.DirectionalLight(new THREE.Color(sunColor), 0.9);
			scene.add(camera);
			camera.add(key, back, glowLight);
			scene.add(hemi);

			// ── Monolith + seam ─────────────────────────────────────────────────
			const monolith = new THREE.Group();
			const slabMaterial = new THREE.MeshStandardMaterial({
				color: new THREE.Color(slabColor),
				roughness: 0.38,
				metalness: 0.5,
				emissive: new THREE.Color(rimColor),
				emissiveIntensity: 0.05,
			});
			const slab = new THREE.Mesh(
				new THREE.BoxGeometry(0.92, 2.7, 0.34),
				slabMaterial,
			);
			// The seam: unlit hairline slightly proud of the front face, so it
			// reads as a source of light rather than paint.
			const seamMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color(rimColor),
			});
			const seam = new THREE.Mesh(
				new THREE.BoxGeometry(0.024, 2.3, 0.02),
				seamMaterial,
			);
			seam.position.set(0, 0, 0.175);
			// A second seam on the far face — the rim reads from both sides.
			const seamBack = new THREE.Mesh(
				new THREE.BoxGeometry(0.024, 2.3, 0.02),
				seamMaterial,
			);
			seamBack.position.set(0, 0, -0.175);
			monolith.add(slab, seam, seamBack);
			scene.add(monolith);

			// ── Floor: one shader plane. Grid lines with analytic AA, the pool of
			// light under the slab, and a pulse rolling out of the vanishing point
			// are all computed per-pixel. A radial void mask fades every trace of
			// the floor out before the plane's edge, so the grid sits on an island
			// in a void — no horizon line, no polygon edge, ever.
			const floorMaterial = new THREE.ShaderMaterial({
				uniforms: {
					uBg: { value: new THREE.Color(backgroundColor) },
					uLine: { value: new THREE.Color(rimColor) },
					uTime: { value: 0 },
				},
				vertexShader: /* glsl */ `
					varying vec3 vWorld;
					void main() {
						vec4 wp = modelMatrix * vec4(position, 1.0);
						vWorld = wp.xyz;
						gl_Position = projectionMatrix * viewMatrix * wp;
					}
				`,
				fragmentShader: /* glsl */ `
					precision highp float;
					varying vec3 vWorld;
					uniform vec3 uBg;
					uniform vec3 uLine;
					uniform float uTime;
					void main() {
						// Analytic AA on the line mask — fwidth keeps far lines from
						// aliasing into moire.
						vec2 g = vWorld.xz * 0.42;
						vec2 w = fwidth(g) * 1.4 + 1e-4;
						vec2 gg = abs(fract(g) - 0.5);
						float lines = 1.0 - min(min(gg.x / w.x, gg.y / w.y), 1.0);

						// Distance fade BEFORE the lines go sub-pixel: grazing-angle
						// cells thinner than a pixel are what shimmer as the camera
						// drifts, so the grid dissolves while it can still be resolved.
						// Fading CLOSE to the viewer keeps the void gap under the sun
						// wide — the grid's far edge sits low in frame, the sun high.
						float r = length(vWorld.xz);
						lines *= 1.0 - smoothstep(8.0, 18.0, r);

						// Pulse rolling out of the vanishing point, on the scene clock.
						float ring = fract(uTime * 0.14);
						float pulse = exp(-abs(r / 26.0 - ring) * 26.0) * 0.5;
						vec3 col = uLine * (lines * (0.42 + pulse));

						// Light pool smeared back from beneath the slab — sells the hover.
						float pool = exp(-length(vec2(vWorld.x, max(vWorld.z, 0.0) * 0.55)) * 0.55);
						col += uLine * pool * 0.22;

						// The void: lines and pool fade out well before the plane's edge,
						// so the floor dissolves into nothing.
						float voidMask = 1.0 - smoothstep(16.0, 26.0, r);
						gl_FragColor = vec4(col, 1.0);
						#include <tonemapping_fragment>
						// The floor's BASE is the sky. Lines and pool are light ADDED over
						// it, so the plane never has a colour of its own and its edge can
						// never show — on any background, not only a near-black one where
						// "black between the lines" happens to pass. Added after
						// tonemapping: three clears scene.background colourspace-converted
						// but never tonemapped, so raw uBg is the only base that lands on
						// exactly the sky.
						gl_FragColor.rgb = uBg + gl_FragColor.rgb * voidMask;
						#include <colorspace_fragment>
					}
				`,
			});
			// 80×80: the void fade completes at r=38, so the plane ends just past
			// it — no invisible depth-writing band reaching toward the sun.
			const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMaterial);
			// Dead flat: any pitch past horizontal is world-fixed, so an orbiting
			// camera reads it as a sideways roll from every bearing but home.
			floor.rotation.x = -Math.PI / 2;
			floor.position.y = -2.6;
			scene.add(floor);

			// ── The sun: a star in deep space, top-right of the frame. Three
			// camera-anchored additive sprites parked just inside the far plane:
			// a white-hot core (a star overexposes to white whatever its colour),
			// an inverse-square glow in sunColor, and a wide faint corona. Additive
			// because a light source can only add light — normal blending would
			// paint a dark sunColor as a smudge over a bright sky. Camera-anchored
			// on purpose: a world-fixed sun would swing behind the eye for half of
			// every idle orbit and leave the composition without its light.
			const radialTexture = (stops: Array<[number, string]>) => {
				const c = document.createElement("canvas");
				c.width = c.height = 256;
				const ctx = c.getContext("2d");
				if (ctx) {
					const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
					for (const [at, color] of stops) grad.addColorStop(at, color);
					ctx.fillStyle = grad;
					ctx.fillRect(0, 0, 256, 256);
				}
				return new THREE.CanvasTexture(c);
			};
			const sunSprite = (stops: Array<[number, string]>, opacity: number) =>
				new THREE.Sprite(
					new THREE.SpriteMaterial({
						map: radialTexture(stops),
						color: new THREE.Color(sunColor),
						transparent: true,
						opacity,
						// Depth test off: the sun lives beyond the floor's far field, and
						// the floor still writes depth there — without this the plane
						// hides the sun. The slab is centre-frame, the sun top-corner:
						// they don't meaningfully overlap.
						depthTest: false,
						depthWrite: false,
						fog: false,
						// A light source, not scenery: tone mapping would grey it out.
						toneMapped: false,
						blending: THREE.AdditiveBlending,
					}),
				);
			// Photosphere: a hard disc with a soft limb — the only layer that
			// stays white. Sized as a pinpoint: distance is sold by size.
			const sunCore = sunSprite(
				[
					[0, "rgba(255,255,255,1)"],
					[0.3, "rgba(255,255,255,1)"],
					[0.5, "rgba(255,255,255,0.35)"],
					[1, "rgba(255,255,255,0)"],
				],
				1,
			);
			// Glow: steep inverse-square falloff, the colour lives here.
			const sunGlow = sunSprite(
				[
					[0, "rgba(255,255,255,1)"],
					[0.08, "rgba(255,255,255,0.55)"],
					[0.25, "rgba(255,255,255,0.18)"],
					[0.6, "rgba(255,255,255,0.04)"],
					[1, "rgba(255,255,255,0)"],
				],
				1,
			);
			// Corona: a very wide, very faint wash that lights the sky around it.
			const sunCorona = sunSprite(
				[
					[0, "rgba(255,255,255,0.4)"],
					[0.45, "rgba(255,255,255,0.1)"],
					[1, "rgba(255,255,255,0)"],
				],
				0.6,
			);
			// Drawn before the stars (renderOrder 0 vs 1): the sun sits behind the
			// star field, and stars drift across its face as the scene orbits.
			camera.add(sunCore, sunGlow, sunCorona);
			// Pinned to the top-right of the FRUSTUM, not to fixed units: the
			// sprites sit at SUN_DEPTH in camera space, so a frame fraction becomes
			// world units via the frustum's half-height there and the sun lands in
			// the same corner on every aspect ratio. Re-run on resize.
			const SUN_DEPTH = 250;
			const placeSun = () => {
				const halfH = SUN_DEPTH * Math.tan((camera.fov * Math.PI) / 360);
				const halfW = halfH * camera.aspect;
				const x = halfW * 0.58;
				const y = halfH * 0.52;
				sunCore.position.set(x, y, -SUN_DEPTH);
				sunGlow.position.set(x, y, -SUN_DEPTH - 1);
				sunCorona.position.set(x, y, -SUN_DEPTH - 2);
				sunCore.scale.set(halfH * 0.075, halfH * 0.075, 1);
				sunGlow.scale.set(halfH * 0.9, halfH * 0.9, 1);
				sunCorona.scale.set(halfH * 2.6, halfH * 1.9, 1);
				// The sun's light comes from the sun's bearing.
				glowLight.position.set(x, y, -SUN_DEPTH).normalize().multiplyScalar(5);
			};
			placeSun();

			const starCount = 320;
			const starPositions = new Float32Array(starCount * 3);
			for (let i = 0; i < starCount; i++) {
				const a = Math.random() * Math.PI * 2;
				const r = 26 + Math.random() * 22;
				const y = 3 + Math.random() * 26;
				starPositions[i * 3] = Math.cos(a) * r;
				starPositions[i * 3 + 1] = y;
				starPositions[i * 3 + 2] = Math.sin(a) * r;
			}
			const starGeometry = new THREE.BufferGeometry();
			starGeometry.setAttribute(
				"position",
				new THREE.BufferAttribute(starPositions, 3),
			);
			const stars = new THREE.Points(
				starGeometry,
				new THREE.PointsMaterial({
					color: 0xd8d4e8,
					size: 0.11,
					transparent: true,
					opacity: 0.95,
					sizeAttenuation: true,
					// Stars pass IN FRONT of the sun: the sun writes no depth, so the depth
					// test (kept — the slab must still occlude them) never hides a star, and
					// a renderOrder above the sun sprites means the sort can never put one
					// under the glow. Additive so a star over the corona adds a point of
					// light rather than punching a grey hole in it.
					depthWrite: false,
					blending: THREE.AdditiveBlending,
					fog: false,
				}),
			);
			stars.renderOrder = 1;
			scene.add(stars);

			// ── Frame ───────────────────────────────────────────────────────────
			let time = 0;
			let bobT = 0;

			drawRef.current = (dt) => {
				const l = live.current;
				const o = orbit.current;
				const step = Math.min(dt, 1 / 30);
				// Paused still redraws every frame — colour and zoom tuning land
				// immediately, the camera can still be dragged, nothing advances.
				const still = pausedRef.current || l.reducedMotion;

				if (!still) {
					time = (time + step) % 1000;
					bobT = (bobT + step) % 1000;
					if (!o.dragging && l.autoSpin) {
						o.theta += l.spinSpeed * step;
						o.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, o.phi + o.vPhi * step));
						const decay = Math.pow(0.92, step * 60);
						o.vTheta *= decay;
						o.vPhi *= decay;
					}
					o.theta %= Math.PI * 2;
					// Parallax steering eases rather than snaps — same feel as
					// grid-horizon's vanishing-point pointer.
					if (l.parallax) {
						const ease = Math.min(1, step * 4.5);
						pointer.current.x += (pointer.current.tx - pointer.current.x) * ease;
						pointer.current.y += (pointer.current.ty - pointer.current.y) * ease;
					}
				}

				// Camera on its sphere around the slab. Parallax adds eased
				// azimuth/elevation offsets on top of the orbit angles; phi stays
				// inside its band, so the parallax can never dive under the floor.
				const parallaxOn = l.parallax && !l.reducedMotion ? 1 : 0;
				const thetaEff = o.theta + pointer.current.x * 0.3 * parallaxOn;
				const phiEff = Math.max(
					PHI_MIN,
					Math.min(PHI_MAX, o.phi - pointer.current.y * 0.18 * parallaxOn),
				);
				camera.position.setFromSphericalCoords(
					RADIUS / Math.max(l.zoom, 0.2),
					phiEff,
					thetaEff,
				);

				// Scale grows the slab UP from the grid; floatAmp is lift-off from
				// there. At 0.00 the slab stands ON the grid (0.02 shy of z-fighting
				// with it); the bob is a half-sine press-and-rise from the ground.
				monolith.scale.setScalar(l.scale);
				const restY = -1.23 + (l.scale - 1) * 1.35;
				if (l.reducedMotion) {
					monolith.position.y = restY;
				} else if (!still) {
					monolith.position.y =
						restY + l.floatAmp * (1 - Math.cos(bobT * 0.8));
				}
				// The look target tracks the rest height (not the bob), so the
				// standing slab stays framed and the hover reads against the floor.
				target.set(0, restY + 0.35, 0);
				camera.position.add(target);
				camera.lookAt(target);

				slabMaterial.color.set(l.slabColor);
				slabMaterial.emissive.set(l.rimColor);
				seamMaterial.color
					.set(l.rimColor)
					.multiplyScalar(
						0.8 + 0.35 * Math.sin(time * 1.7) * (l.reducedMotion ? 0 : 1),
					);
				back.color.set(l.rimColor);
				glowLight.color.set(l.sunColor);
				glowLight.intensity = l.sun ? 0.9 : 0;
				sunCore.visible = sunGlow.visible = sunCorona.visible = l.sun;
				sunCore.material.color.set(l.sunColor);
				sunGlow.material.color.set(l.sunColor);
				sunCorona.material.color.set(l.sunColor);
				(scene.background as THREE.Color).set(l.backgroundColor);
				floorMaterial.uniforms.uTime.value = time;
				// The floor is BASED on uBg, so it has to track the live background or a
				// colour change leaves a mismatched band where the grid dissolves.
				floorMaterial.uniforms.uBg.value.set(l.backgroundColor);
				floorMaterial.uniforms.uLine.value.set(l.rimColor);

				renderer.render(scene, camera);
			};

			measureRef.current = ({ width, height, dpr }) => {
				renderer.setPixelRatio(dpr);
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
				camera.aspect = Math.max(width, 1) / Math.max(height, 1);
				camera.updateProjectionMatrix();
				placeSun();
				drawRef.current?.(0.016);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				scene.traverse((node) => {
					const mesh = node as THREE.Mesh;
					if (mesh.geometry) mesh.geometry.dispose();
					const material = mesh.material as
						| THREE.Material
						| THREE.Material[]
						| undefined;
					if (Array.isArray(material)) {
						material.forEach((m) => m.dispose());
					} else {
						material?.dispose();
					}
				});
				for (const s of [sunCore, sunGlow, sunCorona]) {
					s.material.map?.dispose();
					s.material.dispose();
				}
				renderer.dispose();
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback]);

		useEffect(() => {
			loop.paint();
		}, [slabColor, rimColor, sunColor, sun, backgroundColor, spinSpeed, floatAmp, zoom, autoSpin, loop]);

		const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
			const o = orbit.current;
			o.dragging = true;
			o.pointerId = e.pointerId;
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			o.vTheta = 0;
			o.vPhi = 0;
			e.currentTarget.setPointerCapture(e.pointerId);
			loop.start();
		};

		const track = (e: React.PointerEvent<HTMLDivElement>) => {
			const r = e.currentTarget.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			// Parallax target tracks the pointer on every move, drag or not.
			pointer.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
			pointer.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);

			const o = orbit.current;
			if (!o.dragging || e.pointerId !== o.pointerId) return;
			const dx = e.clientX - o.lastX;
			const dy = e.clientY - o.lastY;
			const dt = (e.timeStamp - o.lastT) / 1000;
			// Grab-the-world yaw; polar NEGATED so dragging down raises the camera
			// (look down more) — the band clamp keeps the framing a hero.
			const dTheta = -dx * 0.005;
			const dPhi = -dy * 0.004;
			o.theta += dTheta;
			o.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, o.phi + dPhi));
			if (dt > 0.001) {
				o.vTheta = dTheta / dt;
				o.vPhi = dPhi / dt;
			}
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			loop.start();
		};

		const release = () => {
			// The lean self-centres when the pointer leaves, like the run's
			// self-levelling bank.
			pointer.current.tx = 0;
			pointer.current.ty = 0;
			orbit.current.dragging = false;
			orbit.current.pointerId = -1;
		};

		const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
			const o = orbit.current;
			if (o.pointerId !== -1 && e.currentTarget.hasPointerCapture(o.pointerId)) {
				e.currentTarget.releasePointerCapture(o.pointerId);
			}
			o.dragging = false;
			o.pointerId = -1;
			loop.start();
		};

		if (fallback) {
			return (
				<div
					className={className ?? "relative h-full w-full overflow-hidden"}
					style={{
						backgroundColor,
						backgroundImage: `radial-gradient(circle at 50% 42%, ${sunColor}44 0%, transparent 52%), linear-gradient(to bottom, ${backgroundColor}, ${rimColor}22)`,
					}}
				/>
			);
		}

		return (
			<div
				ref={containerRef}
				className={
					className ??
					// cursor-default: this is a hero template, not an inspector — the
					// pointer is a viewer, not a grab tool.
					"relative h-full w-full cursor-default overflow-hidden [&_canvas]:touch-none"
				}
				onPointerDown={onPointerDown}
				onPointerMove={track}
				onPointerUp={endDrag}
				onPointerLeave={release}
				onPointerCancel={endDrag}
			/>
		);
	},
);

Monolith.displayName = "Monolith";

export default Monolith;
