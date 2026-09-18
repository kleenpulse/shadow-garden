/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/immutability */
"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, useTexture } from "./gltf";
import {
	type Group,
	type Mesh,
	type MeshStandardMaterial,
	Box3,
	Vector3,
	SRGBColorSpace,
	LinearSRGBColorSpace,
	BufferAttribute,
} from "three";
import { useMenuStore } from "../lib/store";
import {
	DIST_FROM_CAM,
	HOVER_ANIMATION_SPEED,
	MODEL_SIZE,
	MODEL_VERTICAL_OFFSET,
	SCROLL_ANIMATION_SCALE,
	TOP_OF_PAGE_THRESHOLD,
	VELOCITY_SMOOTHING,
	VELOCITY_THRESHOLD,
} from "../lib/constants";
import { asset, rawAsset } from "../../_shared/cdn";

// The model and its maps are delivered, not bundled: the repo ships no binaries
// (§C12), and a 9MB .glb is the most literal possible violation of that. `rawAsset`
// rather than `asset` because a GLTF binary has nothing to transcode — a transform
// segment on a raw URL is a 404, not a no-op.
const MODEL_URL = rawAsset("imago/scene.glb");

// Preload GLTF model outside component for better performance
useGLTF.preload(MODEL_URL);

type ImagoModelProps = {
	scrollProgress: { readonly current: number };
	scrollVelocity: { readonly current: number };
	onLoadProgress?: (progress: number) => void;
	onLoadComplete?: () => void;
};

export function ImagoModel({
	scrollProgress,
	scrollVelocity,
	onLoadProgress,
	onLoadComplete,
}: ImagoModelProps) {
	const groupRef = useRef<Group>(null!);
	const { scene, animations } = useGLTF(MODEL_URL);
	const { actions, mixer } = useAnimations(animations, groupRef);
	const { invalidate, viewport } = useThree();
	const animTimeAccumulator = useRef<number>(0);
	const smoothedVelocity = useRef<number>(0);
	const loadingTracker = useRef({ model: false, textures: 0 });
	const isMenuOpen = useMenuStore((state) => state.isOpen);

	const modelSize = MODEL_SIZE;
	const modelVerticalOffset = MODEL_VERTICAL_OFFSET;
	const velocitySmoothing = VELOCITY_SMOOTHING;
	const hoverAnimationSpeed = HOVER_ANIMATION_SPEED;
	const velocityThreshold = VELOCITY_THRESHOLD;
	const topOfPageThreshold = TOP_OF_PAGE_THRESHOLD;
	const scrollAnimationScale = SCROLL_ANIMATION_SCALE;
	const distFromCam = DIST_FROM_CAM;

	// Load textures with useTexture hook
	const [diffuse, normal, occlusion, specGloss] = useTexture([
		asset("imago/material-diffuse"),
		asset("imago/material-normal"),
		asset("imago/material-occlusion"),
		asset("imago/material-spec-gloss"),
	]);

	// Track loading progress
	useEffect(() => {
		// Mark model as loaded
		if (scene) {
			loadingTracker.current.model = true;
		}

		// Mark textures as loaded individually
		if (diffuse)
			loadingTracker.current.textures = Math.max(
				loadingTracker.current.textures,
				1,
			);
		if (normal)
			loadingTracker.current.textures = Math.max(
				loadingTracker.current.textures,
				2,
			);
		if (occlusion)
			loadingTracker.current.textures = Math.max(
				loadingTracker.current.textures,
				3,
			);
		if (specGloss)
			loadingTracker.current.textures = Math.max(
				loadingTracker.current.textures,
				4,
			);

		// Calculate and update progress
		const totalAssets = 5; // 1 model + 4 textures
		const loadedAssets =
			(loadingTracker.current.model ? 1 : 0) + loadingTracker.current.textures;
		const progress = (loadedAssets / totalAssets) * 100;

		onLoadProgress?.(progress);

		// Complete when all assets are loaded
		if (loadedAssets === totalAssets) {
			onLoadComplete?.();
		}
	}, [
		scene,
		diffuse,
		normal,
		occlusion,
		specGloss,
		onLoadProgress,
		onLoadComplete,
	]);

	// Configure textures and materials for optimal quality
	useEffect(() => {
		// Set correct color spaces for textures
		diffuse.colorSpace = SRGBColorSpace;
		diffuse.flipY = false;
		diffuse.needsUpdate = true;

		normal.colorSpace = LinearSRGBColorSpace;
		normal.flipY = false;
		normal.needsUpdate = true;

		occlusion.colorSpace = LinearSRGBColorSpace;
		occlusion.flipY = false;
		occlusion.needsUpdate = true;

		specGloss.colorSpace = LinearSRGBColorSpace;
		specGloss.flipY = false;
		specGloss.needsUpdate = true;

		// Apply textures to all meshes in the scene
		scene.traverse((obj) => {
			const mesh = obj as Mesh;
			if (!mesh.isMesh) return;

			const mats = Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material];

			mats.forEach((m) => {
				const mat = m as MeshStandardMaterial;

				// Assign textures
				mat.map = diffuse;
				mat.normalMap = normal;
				mat.aoMap = occlusion;
				mat.roughnessMap = specGloss;

				// Ensure UV2 exists for ambient occlusion map
				if (!mesh.geometry.attributes.uv2 && mesh.geometry.attributes.uv) {
					mesh.geometry.setAttribute(
						"uv2",
						new BufferAttribute(mesh.geometry.attributes.uv.array, 2),
					);
				}

				// Set material properties for realistic appearance
				mat.roughness = 0.4;
				mat.metalness = 0.1;
				mat.aoMapIntensity = 1.0;

				mat.needsUpdate = true;
			});
		});

		invalidate();
	}, [scene, diffuse, normal, occlusion, specGloss, invalidate]);

	useEffect(() => {
		return () => {
			scene.traverse((obj: any) => {
				if (obj.geometry) {
					obj.geometry.dispose();
				}
				const mats = obj.material
					? Array.isArray(obj.material)
						? obj.material
						: [obj.material]
					: [];
				mats.forEach((m: any) => {
					m.map?.dispose();
					m.normalMap?.dispose();
					m.aoMap?.dispose();
					m.roughnessMap?.dispose();
					m.dispose();
				});
			});
			// Dispose textures
			diffuse.dispose();
			normal.dispose();
			occlusion.dispose();
			specGloss.dispose();
		};
	}, [scene, diffuse, normal, occlusion, specGloss]);

	// Auto-scale model to desired size
	useEffect(() => {
		if (!groupRef.current) return;

		const box = new Box3().setFromObject(groupRef.current);
		const size = new Vector3();
		box.getSize(size);
		const maxDim = Math.max(size.x, size.y, size.z);

		// Scale to modelSize
		groupRef.current.scale.setScalar(modelSize / maxDim);

		// Center the model
		const center = new Vector3();
		box.getCenter(center);
		groupRef.current.position.set(-center.x, -center.y, -center.z);

		// Set name for ASCII effect targeting
		groupRef.current.name = "imago";

		invalidate();
	}, [scene, invalidate, modelSize]);

	// Initialize animations - prepare all actions for blending
	useEffect(() => {
		if (!actions || Object.keys(actions).length === 0) return;

		// Get first animation clip
		const firstAction = Object.values(actions)[0];
		if (firstAction) {
			firstAction.play();
			firstAction.paused = true;
			firstAction.setEffectiveWeight(1);
			firstAction.timeScale = hoverAnimationSpeed;
		}

		invalidate();
	}, [actions, invalidate, hoverAnimationSpeed]);

	// Animation loop - control animation based on scroll velocity
	useFrame((_state, delta) => {
		if (!groupRef.current || !mixer) return;

		// Pause animation if menu is open
		if (isMenuOpen) {
			const firstAction = Object.values(actions)[0];
			if (firstAction) {
				firstAction.paused = true;
			}
			invalidate();
			return;
		}

		const p = scrollProgress.current;
		const velocity = scrollVelocity.current;

		// Smooth velocity transitions using lerp for gentler animation
		smoothedVelocity.current +=
			(velocity - smoothedVelocity.current) * velocitySmoothing;

		const firstAction = Object.values(actions)[0];
		if (firstAction) {
			const velocityMagnitude = Math.abs(smoothedVelocity.current);
			const isAtTop = p < topOfPageThreshold;

			if (isAtTop || velocityMagnitude <= velocityThreshold) {
				firstAction.paused = false;
				firstAction.timeScale = hoverAnimationSpeed;

				mixer.update(delta);

				// Sync accumulator with current time for smooth transition
				animTimeAccumulator.current = firstAction.time;
			} else {
				// Scroll-based animation: accumulate time based on velocity
				const clip = firstAction.getClip();
				const duration = clip.duration || 1;

				// Scale velocity to match natural animation speed
				animTimeAccumulator.current += velocityMagnitude * scrollAnimationScale;
				firstAction.time = animTimeAccumulator.current % duration;
				firstAction.paused = true;

				// Update mixer with zero delta to prevent auto-advancement
				mixer.update(0);
			}
		}

		const viewportWidth = viewport.width;
		const isMobile = viewportWidth < 8; // Approximate mobile breakpoint in Three.js units
		const horizontalAmplitude = isMobile ? viewportWidth * 0.35 : 4;
		groupRef.current.position.x =
			Math.sin(p * Math.PI * 4.5) * horizontalAmplitude;

		// Vertical movement
		groupRef.current.position.y = modelVerticalOffset;

		// Depth: distance from camera
		groupRef.current.position.z = distFromCam;

		// Rotation: at p=0 face away from camera (180°), then rotate with scroll
		groupRef.current.rotation.y = Math.PI + p * Math.PI * 2;

		const isAtTop = p < topOfPageThreshold;
		const tiltAmount = isAtTop ? 0.4 : 0;
		groupRef.current.rotation.x = tiltAmount;

		invalidate();
	});

	return <primitive ref={groupRef} object={scene} />;
}
