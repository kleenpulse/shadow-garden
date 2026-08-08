"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

export interface PreloaderProps {
	/** Self-driving demo loop: count 0→100, hold, fade out. */
	simulate?: boolean;
	/** Simulated load time in seconds. */
	duration?: number;
	/** Pause at 100% before the fade, in seconds. */
	holdDelay?: number;
	fadeDuration?: number;
	ringColor?: string;
	overlayColor?: string;
	/** Ring diameter in px. */
	ringSize?: number;
	/** Seconds per spinner revolution. */
	spinSpeed?: number;
	label?: string;
	showLabel?: boolean;
	/** Controlled mode: real load progress 0–100. */
	progress?: number;
	/** Controlled mode: fade the overlay out. */
	isComplete?: boolean;
	onComplete?: () => void;
	reducedMotion?: boolean;
	className?: string;
}

export default function Preloader({
	simulate = false,
	duration = 3,
	holdDelay = 0.4,
	fadeDuration = 0.6,
	ringColor = "#a855f7",
	overlayColor = "#000000",
	ringSize = 128,
	spinSpeed = 1.5,
	label = "Loading Experience",
	showLabel = true,
	progress = 0,
	isComplete = false,
	onComplete,
	reducedMotion = false,
	className,
}: PreloaderProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const counterRef = useRef<HTMLSpanElement>(null);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	const writeCount = (v: number) => {
		if (counterRef.current) {
			counterRef.current.textContent = String(Math.round(v));
		}
	};

	useEffect(() => {
		if (!simulate || reducedMotion) return;
		const ctx = gsap.context(() => {
			// Proxy object instead of an innerText tween — StrictMode's double
			// mount would otherwise resume from a stale DOM value.
			const proxy = { v: 0 };
			const tl = gsap.timeline();
			tl.to(proxy, {
				v: 100,
				duration,
				ease: "power2.inOut",
				onUpdate: () => writeCount(proxy.v),
			});
			tl.to(rootRef.current, {
				opacity: 0,
				duration: fadeDuration,
				ease: "power2.inOut",
				delay: holdDelay,
				onComplete: () => {
					if (rootRef.current) rootRef.current.style.display = "none";
					onCompleteRef.current?.();
				},
			});
		}, rootRef);
		return () => ctx.revert();
	}, [simulate, reducedMotion, duration, holdDelay, fadeDuration]);

	useEffect(() => {
		if (simulate || reducedMotion) return;
		const proxy = { v: Number(counterRef.current?.textContent) || 0 };
		const tween = gsap.to(proxy, {
			v: Math.min(100, Math.max(0, progress)),
			duration: 0.5,
			ease: "power2.out",
			onUpdate: () => writeCount(proxy.v),
		});
		return () => {
			tween.kill();
		};
	}, [simulate, reducedMotion, progress]);

	useEffect(() => {
		if (simulate || reducedMotion || !isComplete) return;
		const tween = gsap.to(rootRef.current, {
			opacity: 0,
			duration: fadeDuration,
			ease: "power2.inOut",
			onComplete: () => {
				if (rootRef.current) {
					rootRef.current.style.pointerEvents = "none";
					rootRef.current.style.display = "none";
				}
				onCompleteRef.current?.();
			},
		});
		return () => {
			tween.kill();
		};
	}, [simulate, reducedMotion, isComplete, fadeDuration]);

	const staticCount = reducedMotion
		? simulate
			? 100
			: Math.round(progress)
		: 0;

	return (
		<div
			ref={rootRef}
			className={cn(
				"absolute inset-0 z-40 flex items-center justify-center",
				className,
			)}
			style={{ background: overlayColor }}
		>
			<div className="flex flex-col items-center gap-6">
				<div
					className="relative"
					style={{ width: ringSize, height: ringSize }}
				>
					<div className="absolute inset-0 rounded-full border-2 border-white/20" />
					<div
						className="absolute inset-0 animate-spin rounded-full border-2"
						style={{
							borderColor: ringColor,
							borderTopColor: "transparent",
							animationDuration: `${spinSpeed}s`,
							...(reducedMotion && { animation: "none" }),
						}}
					/>
				</div>
				<div className="flex flex-col items-center gap-2">
					<div
						className="text-6xl font-bold tabular-nums"
						style={{ color: ringColor }}
					>
						<span ref={counterRef}>{staticCount}</span>%
					</div>
					{showLabel && (
						<p
							className="text-sm uppercase tracking-wider"
							style={{
								color: `color-mix(in srgb, ${ringColor} 60%, transparent)`,
							}}
						>
							{label}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
