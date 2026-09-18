/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

type LoaderProps = {
	progress: number;
	isComplete: boolean;
};

export default function Loader({ progress, isComplete }: LoaderProps) {
	const counterRef = useRef<HTMLSpanElement>(null);
	const loaderRef = useRef<HTMLDivElement>(null);
	const animationRef = useRef<gsap.core.Tween | null>(null);
	const [hasVisited, setHasVisited] = useState(false);

	useEffect(() => {
		const hasVisited = sessionStorage.getItem("hasVisited");
		if (hasVisited) {
			setHasVisited(true);
		}
	}, []);

	useEffect(() => {
		if (progress >= 100 && isComplete) {
			sessionStorage.setItem("hasVisited", "true");
		}
	}, [progress, isComplete]);
	useEffect(() => {
		if (counterRef.current) {
			gsap.to(counterRef.current, {
				innerText: Math.round(progress),
				duration: 0.5,
				snap: { innerText: 1 },
				ease: "power2.out",
			});
		}
	}, [progress]);

	useEffect(() => {
		if (isComplete && loaderRef.current) {
			animationRef.current = gsap.to(loaderRef.current, {
				opacity: 0,
				duration: 0.6,
				ease: "power2.inOut",
				onComplete: () => {
					if (loaderRef.current) {
						loaderRef.current.style.pointerEvents = "none";
						loaderRef.current.style.display = "none";
					}
				},
			});
		}

		return () => {
			// Cleanup animation on unmount
			if (animationRef.current) {
				animationRef.current.kill();
			}
		};
	}, [isComplete]);
	if (hasVisited) return null;
	return (
		<div
			ref={loaderRef}
			className="fixed inset-0 z-999 flex items-center justify-center bg-black"
		>
			<div className="flex flex-col items-center gap-6">
				<div className="relative">
					<div className="w-32 h-32 rounded-full border-2 border-white/20" />
					<div
						className="absolute inset-0 w-32 h-32 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin"
						style={{ animationDuration: "1.5s" }}
					/>
				</div>
				<div className="flex flex-col items-center gap-2">
					<div className="text-6xl font-bold text-[var(--accent)] tabular-nums">
						<span ref={counterRef}>0</span>%
					</div>
					<p className="text-[var(--accent)]/60 text-sm tracking-wider uppercase">
						Loading Experience
					</p>
				</div>
			</div>
		</div>
	);
}
