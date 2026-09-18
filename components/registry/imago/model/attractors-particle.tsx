/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import {
	float,
	If,
	PI,
	color,
	cos,
	instanceIndex,
	Loop,
	mix,
	mod,
	sin,
	storage,
	Fn,
	uint,
	uniform,
	uniformArray,
	hash,
	vec3,
	vec4,
} from "three/tsl";
import {
	WebGPURenderer,
	SpriteNodeMaterial,
	StorageInstancedBufferAttribute,
} from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import WebGPU from "three/addons/capabilities/WebGPU.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const CONFIG = {
	backgroundColor: 0x000000,
	backgroundAlpha: 0, // Transparent background
	particleCount: 5000, // Safe Mode reduction
	attractorMassExponent: 5,
	particleGlobalMassExponent: 6,
	maxSpeed: 8,
	velocityDamping: 0.08,
	spinningStrength: 0.9,
	scale: 0.01,
	boundHalfExtent: 27, // Increased to spread particles across entire viewport
	colorA: 0xe73803,
	colorB: 0x9358ff,
	cameraPosition: [0, 20, 0.1] as [number, number, number],
};

export default function AttractorsParticle() {
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollProgress = useRef<number>(0);
	const scrollVelocity = useRef<number>(0);

	useEffect(() => {
		if (!containerRef.current) return;

		if (WebGPU.isAvailable() === false) {
			console.warn("No WebGPU support, particles will not be rendered.");
			return;
		}

		let active = true;
		const container = containerRef.current;
		let renderer: WebGPURenderer | null = null;

		const init = async () => {
			if (!containerRef.current) return;

			// Async check for WebGPU availability since it might be lost or recovering
			// navigator.gpu is not in lib.dom yet; narrow it here rather than adding
			// @webgpu/types to the install line for one feature detect.
			const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } })
				.gpu;
			const hasWebGPU =
				WebGPU.isAvailable() || (gpu && (await gpu.requestAdapter()));
			if (!hasWebGPU) {
				const errorMsg = WebGPU.getErrorMessage();
				container.appendChild(errorMsg);
				console.error(
					"WebGPU not available. If you just had a crash, please restart your browser.",
				);
				return;
			}

			const width = window.innerWidth;
			const height = window.innerHeight;

			const camera = new THREE.PerspectiveCamera(25, width / height, 0.1, 100);
			camera.position.set(...CONFIG.cameraPosition);

			const scene = new THREE.Scene();

			// Scroll Interaction Setup
			ScrollTrigger.create({
				trigger: document.documentElement,
				start: "top top",
				end: "bottom bottom",
				scrub: 1,
				onUpdate: (self) => {
					scrollProgress.current = self.progress;
					scrollVelocity.current = Math.abs(self.getVelocity() / 1000);
				},
			});

			// Render Mastermind
			renderer = new WebGPURenderer({ antialias: true, alpha: true });
			renderer.setPixelRatio(window.devicePixelRatio);
			renderer.setSize(width, height);
			renderer.setClearColor(CONFIG.backgroundColor, CONFIG.backgroundAlpha);

			await renderer.init();
			if (!active) {
				renderer.dispose();
				return;
			}

			container.appendChild(renderer.domElement);

			const controls = new OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;
			controls.minDistance = 0.1;
			controls.maxDistance = 50;
			controls.target.set(0, 0, 0);

			// Attractors - spread wider to cover more screen space
			const attractorsPositions = uniformArray([
				new THREE.Vector3(-3, 0, 0),
				new THREE.Vector3(3, 0, -1.5),
				new THREE.Vector3(0, 1.5, 3),
			]);
			const attractorsRotationAxes = uniformArray([
				new THREE.Vector3(0, 1, 0),
				new THREE.Vector3(0, 1, 0),
				new THREE.Vector3(1, 0, -0.5).normalize(),
			]);

			// Particles setup
			const count = CONFIG.particleCount;
			const material = new SpriteNodeMaterial({
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				transparent: true,
			});

			const attractorMass = uniform(
				Number(`1e${CONFIG.attractorMassExponent}`),
			);
			const particleGlobalMass = uniform(
				Number(`1e${CONFIG.particleGlobalMassExponent}`),
			);
			const timeScale = uniform(1);
			const spinningStrength = uniform(CONFIG.spinningStrength);
			const maxSpeed = uniform(CONFIG.maxSpeed);
			const gravityConstant = 6.67e-11;
			const velocityDamping = uniform(CONFIG.velocityDamping);
			const scale = uniform(CONFIG.scale);
			const boundHalfExtent = uniform(CONFIG.boundHalfExtent);
			const scrollRotation = uniform(0);
			const scrollVelocityUniform = uniform(0);
			const colorA = uniform(color(CONFIG.colorA));
			const colorB = uniform(color(CONFIG.colorB));

			const particleMassMultiplierNode = hash(
				instanceIndex.add(uint(Math.random() * 0xffffff)),
			).remap(0.25, 1);

			const positionBuffer = storage(
				new StorageInstancedBufferAttribute(new Float32Array(count * 3), 3),
				"vec3",
				count,
			);
			const velocityBuffer = storage(
				new StorageInstancedBufferAttribute(new Float32Array(count * 3), 3),
				"vec3",
				count,
			);

			// Init compute
			const initComputeFn = Fn(() => {
				const position = positionBuffer.element(instanceIndex);
				const velocity = velocityBuffer.element(instanceIndex);

				const basePosition = vec3(
					hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
					hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
					hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
				)
					.sub(0.5)
					.mul(vec3(15, 5, 15));
				position.assign(basePosition);

				const phi = hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
					.mul(PI)
					.mul(2);
				const theta = hash(
					instanceIndex.add(uint(Math.random() * 0xffffff)),
				).mul(PI);
				const baseVelocity = vec3(phi, theta, 0).mul(0.01); // Simplified init velocity
				velocity.assign(baseVelocity);
			});

			const initCompute = initComputeFn().compute(count);

			// Update compute
			const updateFn = Fn(() => {
				const particleMassMultiplier = particleMassMultiplierNode.toVar();
				const particleMass = particleMassMultiplier.mul(particleGlobalMass);

				const delta = float(1 / 60)
					.mul(timeScale)
					.toVar(); // fixed delta
				const position = positionBuffer.element(instanceIndex);
				const velocity = velocityBuffer.element(instanceIndex);

				const force = vec3(0).toVar();

				// Hardcoded loop count to 3 for maximum stability
				Loop(3, ({ i }: any) => {
					const attractorPositionRaw = attractorsPositions.element(i) as any;
					const attractorRotationAxis = attractorsRotationAxes.element(
						i,
					) as any;

					// Rotate attractor position based on scroll
					const angle = scrollRotation;
					const cosAngle = cos(angle);
					const sinAngle = sin(angle);
					const attractorPosition = vec3(
						attractorPositionRaw.x
							.mul(cosAngle)
							.sub(attractorPositionRaw.z.mul(sinAngle)),
						attractorPositionRaw.y,
						attractorPositionRaw.x
							.mul(sinAngle)
							.add(attractorPositionRaw.z.mul(cosAngle)),
					);

					const toAttractor = attractorPosition.sub(position);
					const distance = toAttractor.length().max(0.01); // Added epsilon to prevent division by zero/huge forces
					const direction = toAttractor.normalize();

					// gravity
					const gravityStrength = attractorMass
						.mul(particleMass)
						.mul(gravityConstant)
						.div(distance.pow(2))
						.toVar();
					const gravityForce = direction.mul(gravityStrength);
					force.addAssign(gravityForce);

					// spinning
					const spinningForce = attractorRotationAxis
						.mul(gravityStrength)
						.mul(spinningStrength);
					const spinningVelocity = spinningForce.cross(toAttractor);
					force.addAssign(spinningVelocity);
				});

				// velocity
				velocity.addAssign(force.mul(delta));
				const speed = velocity.length();
				If(speed.greaterThan(maxSpeed), () => {
					velocity.assign(velocity.div(speed.max(0.0001)).mul(maxSpeed));
				});
				velocity.mulAssign(velocityDamping.oneMinus());

				// position
				position.addAssign(velocity.mul(delta));

				// box loop
				const halfHalfExtent = boundHalfExtent.div(2).toVar();
				position.assign(
					mod(position.add(halfHalfExtent), boundHalfExtent).sub(
						halfHalfExtent,
					),
				);
			});
			const updateCompute = (updateFn() as any).compute(count);

			// Nodes
			material.positionNode = positionBuffer.toAttribute();

			material.colorNode = Fn(() => {
				const velocity = velocityBuffer.toAttribute() as any;
				const speed = velocity.length();
				const colorMix = speed.div(maxSpeed).smoothstep(0, 0.5);
				const finalColor = mix(colorA, colorB, colorMix);

				return vec4(finalColor, 1);
			})();

			material.scaleNode = particleMassMultiplierNode
				.mul(scale)
				.mul(scrollVelocityUniform.add(1));

			// Mesh
			const geometry = new THREE.PlaneGeometry(1, 1);
			const mesh = new THREE.InstancedMesh(geometry, material, count);
			scene.add(mesh);

			// Now we can use renderer.compute with compute node
			renderer.compute(initCompute);

			// Resize Handler (We add it after initialization)
			const onWindowResize = () => {
				if (!active) return;
				const w = window.innerWidth;
				const h = window.innerHeight;
				camera.aspect = w / h;
				camera.updateProjectionMatrix();
				renderer!.setSize(w, h);
			};

			window.addEventListener("resize", onWindowResize);

			// Animation Loop processing
			renderer.setAnimationLoop(() => {
				controls.update();

				// Update scroll-driven uniforms
				const targetRotation = scrollProgress.current * Math.PI * 2;
				scrollRotation.value += (targetRotation - scrollRotation.value) * 0.05;

				const targetVelocity = Math.min(scrollVelocity.current, 5);
				scrollVelocityUniform.value +=
					(targetVelocity - scrollVelocityUniform.value) * 0.1;

				spinningStrength.value =
					CONFIG.spinningStrength + scrollVelocityUniform.value * 5;
				timeScale.value = 1 + scrollVelocityUniform.value * 2;

				renderer!.compute(updateCompute);
				renderer!.render(scene, camera);
			});

			return () => {
				window.removeEventListener("resize", onWindowResize);
				ScrollTrigger.getAll().forEach((t) => t.kill());
			};
		};

		// Variable to hold the inner cleanup from init
		let innerCleanup: (() => void) | null = null;

		init().then((cleanup) => {
			if (cleanup) innerCleanup = cleanup;
		});

		return () => {
			active = false;
			if (innerCleanup) innerCleanup();

			if (renderer) {
				renderer.setAnimationLoop(null);
				// To prevent any memory leak
				renderer.dispose();
				try {
					if (container.contains(renderer.domElement)) {
						container.removeChild(renderer.domElement);
					}
				} catch (e) {
					console.log(e);
				}
			}
		};
	}, []);

	return (
		<div
			ref={containerRef}
			style={{
				width: "100vw",
				height: "100vh",
				position: "fixed",
				bottom: "-1rem",
				left: 0,
			}}
			className="z-1"
		/>
	);
}
