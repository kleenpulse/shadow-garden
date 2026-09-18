"use client";

import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace, Color } from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { AsciiEffectComponent } from "./effects/ascii-effect";
import { ImagoModel } from "./imago-model";
import { OVERLAY_OPACITY, USE_ASCII_EFFECT } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

// Scene background manager component
function SceneBackground() {
	const { scene } = useThree();
	const useAsciiEffect = USE_ASCII_EFFECT;

	useEffect(() => {
		if (useAsciiEffect) {
			// eslint-disable-next-line react-hooks/immutability
			scene.background = new Color(0x000000);
		} else {
			scene.background = null;
		}
	}, [useAsciiEffect, scene]);

	return null;
}

export default function ButterflyScene({
	onLoadProgress,
	onLoadComplete,
}: {
	onLoadProgress?: (progress: number) => void;
	onLoadComplete?: () => void;
}) {
	const scrollProgress = useRef<number>(0);
	const scrollVelocity = useRef<number>(0);
	const tickerCb = useRef<(time: number) => void>(null);
	const useAsciiEffect = USE_ASCII_EFFECT;
	const overlayOpacity = OVERLAY_OPACITY;

	useEffect(() => {
		const lenis = new Lenis({
			duration: 1.4,
			easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
			smoothWheel: true,
			wheelMultiplier: 1,
		});

		tickerCb.current = (time: number) => lenis.raf(time * 1000);
		gsap.ticker.add(tickerCb.current);
		gsap.ticker.lagSmoothing(0);

		ScrollTrigger.scrollerProxy(document.body, {
			scrollTop(value) {
				if (arguments.length && value !== undefined) {
					lenis.scrollTo(value, { immediate: true });
				}
				return lenis.scroll;
			},
			getBoundingClientRect() {
				return {
					top: 0,
					left: 0,
					width: window.innerWidth,
					height: window.innerHeight,
				};
			},
		});

		lenis.on("scroll", ScrollTrigger.update);

		// Track scroll velocity for wing flapping
		lenis.on("scroll", ({ velocity }: { velocity: number }) => {
			scrollVelocity.current = velocity;
		});

		ScrollTrigger.create({
			trigger: document.documentElement,
			start: "top top",
			end: "bottom bottom",
			scrub: 1,
			onUpdate: (self) => {
				scrollProgress.current = self.progress;
			},
		});

		return () => {
			if (tickerCb.current) gsap.ticker.remove(tickerCb.current);
			lenis.destroy();
			ScrollTrigger.getAll().forEach((t) => t.kill());
			ScrollTrigger.clearScrollMemory();
		};
	}, []);

	return (
		<div className="fixed inset-0 z-1 pointer-events-none ">
			{/* CANVAS OVERLAY */}
			<div
				className="fixed inset-0 z-2 transition-opacity duration-300"
				style={{
					backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
				}}
			/>
			<Canvas
				frameloop="demand"
				camera={{ position: [0, 0, 5], fov: 50 }}
				style={{ background: "transparent" }}
				gl={{
					antialias: true,
					alpha: true,
					preserveDrawingBuffer: false,
					powerPreference: "high-performance",
					failIfMajorPerformanceCaveat: false,
				}}
				onCreated={({ gl }) => {
					gl.toneMapping = ACESFilmicToneMapping;
					gl.toneMappingExposure = 1.2;
					gl.outputColorSpace = SRGBColorSpace;

					// Handle WebGL context loss/restore
					gl.domElement.addEventListener("webglcontextlost", (e) => {
						e.preventDefault();
					});
					gl.domElement.addEventListener("webglcontextrestored", () => {
						console.log("WebGL context restored");
					});
				}}
			>
				<SceneBackground />
				<ambientLight intensity={2} />
				<directionalLight position={[5, 10, 5]} intensity={3} />
				<directionalLight position={[-5, -5, -5]} intensity={0.8} />

				<ImagoModel
					scrollProgress={scrollProgress}
					scrollVelocity={scrollVelocity}
					onLoadProgress={onLoadProgress}
					onLoadComplete={onLoadComplete}
				/>
				{useAsciiEffect && (
					<AsciiEffectComponent
						bgColor="black"
						fgColor="white"
						resolution={0.2}
					/>
				)}
			</Canvas>
		</div>
	);
}
