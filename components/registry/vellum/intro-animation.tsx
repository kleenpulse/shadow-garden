"use client";

import { useRef, useState } from "react";
import { gsap } from "gsap";
import LogoIcon from "./icons/logo-icon";
import { useLenis } from "lenis/react";
import { useGSAP } from "./hooks/use-gsap";
import { LettersPull } from "./miscellaneous/letter-pull";

export interface IntroAnimationProps {
	onComplete: () => void;

	duration?: number;
}

const BRAND = "VELLUM";

export function IntroAnimation({
	onComplete,
	duration = 1.5,
}: IntroAnimationProps) {
	const [mounted, setMounted] = useState(true);

	const lenis = useLenis();

	const topHalfRef = useRef<HTMLDivElement>(null);
	const bottomHalfRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
	const ruleRef = useRef<HTMLDivElement>(null);
	const taglineRef = useRef<HTMLSpanElement>(null);
	const logoRef = useRef<HTMLDivElement>(null);

	useGSAP(() => {
		lenis?.stop();
		// Single effect — no race conditions between two useEffects
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			onComplete();
			lenis?.start();

			setMounted(false);
			return;
		}

		const d = Math.max(0.3, duration);

		gsap.set(letterRefs.current, { y: 70, opacity: 0 });
		gsap.set(ruleRef.current, { scaleX: 0, transformOrigin: "left center" });
		gsap.set(taglineRef.current, { y: 12, opacity: 0 });
		gsap.set(logoRef.current, { opacity: 0, y: 16 });

		const tl = gsap.timeline({
			defaults: { ease: "power3.out" },
			onComplete: () => {
				onComplete();
				setMounted(false);
			},
		});

		tl.to(letterRefs.current, {
			y: 0,
			opacity: 1,
			duration: 0.55 * d,
			stagger: 0.055 * d,
		})

			.to(
				ruleRef.current,
				{
					scaleX: 1,
					duration: 0.65 * d,
					ease: "power2.inOut",
				},
				`-=${0.15 * d}`,
			)

			.to(
				taglineRef.current,
				{
					y: 0,
					opacity: 1,
					duration: 0.45 * d,
				},
				`-=${0.35 * d}`,
			)

			.to(
				logoRef.current,
				{
					opacity: 1,
					y: 0,
					duration: 0.25 * d,
					ease: "power2.out",
				},
				`+=0.15`,
			)
			.to(
				logoRef.current,
				{
					opacity: 0,
					duration: 0.25 * d,
					ease: "power2.in",
				},
				`+=0.2`,
			)

			.to(
				contentRef.current,
				{
					opacity: 0,
					duration: 0.25 * d,
					ease: "power1.in",
				},
				`+=0.05`,
			)

			.to(
				topHalfRef.current,
				{
					y: "-100%",
					duration: 0.75 * d,
					ease: "power2.inOut",
				},
				"<",
			)
			.to(
				bottomHalfRef.current,
				{
					y: "100%",
					duration: 0.75 * d,
					ease: "power2.inOut",
				},
				"<",
			);

		return () => {
			tl.kill();
		};
	}, [onComplete, duration]);

	if (!mounted) return null;

	return (
		<div className="fixed inset-0" style={{ zIndex: 999999999 }}>
			<div
				ref={topHalfRef}
				className="absolute inset-x-0 top-0 h-1/2 bg-[var(--background)]"
				style={{ zIndex: 1 }}
			/>
			<div
				ref={bottomHalfRef}
				className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--background)]"
				style={{ zIndex: 1 }}
			/>

			{/* Content layer — above the halves */}
			<div
				ref={contentRef}
				className="absolute inset-0 flex flex-col items-center justify-center"
				style={{ zIndex: 2, gap: "clamp(1rem, 3vh, 1.75rem)" }}
			>
				{/* Brand letters — no initial transform/opacity in CSS */}
				<div className="flex" aria-label={BRAND}>
					<LettersPull
						duration={0.5}
						delay={0.07}
						text={BRAND}
						className="font-black text-[9vw] 2xl:text-[7rem] text-black dark:text-white uppercase tracking-widest"
					/>
				</div>

				{/* Rule + tagline */}
				<div
					className="flex flex-col items-center"
					style={{ gap: "0.6rem", width: "clamp(180px, 30vw, 260px)" }}
				>
					<div
						ref={ruleRef}
						className="h-px w-full bg-black/40 dark:bg-white/40"
					/>
					<span
						ref={taglineRef}
						className="text-black/50 dark:text-white/50 uppercase"
						style={{
							fontFamily: "var(--font-body)",
							fontSize: "clamp(0.6rem, 1.1vw, 0.72rem)",
							letterSpacing: "0.45em",
						}}
					>
						Est. MMXXV
					</span>
				</div>

				<div
					ref={logoRef}
					className="flex items-end"
					style={{ gap: 3, marginTop: "0.5rem" }}
					aria-hidden="true"
				>
					<LogoIcon className="size-10 md:size-20" />
				</div>
			</div>
		</div>
	);
}
