"use client";

import { motion, AnimatePresence } from "motion/react";
import { useMemo } from "react";

export type AnimationType = "flip" | "slide" | "fade" | "scale-bounce";

interface AnimatedNumberDisplayProps {
	// Accepts a pre-formatted string (e.g. "$300,000") so currency/grouping is
	// preserved, or a raw number. The swap animation keys off this value.
	value: string | number;
	animationType?: AnimationType;
	className?: string;
	duration?: number;
}

export function AnimatedNumber({
	value,
	animationType = "flip",
	className = "",
	duration = 0.4,
}: AnimatedNumberDisplayProps) {
	const animationVariants = useMemo(() => {
		const baseConfig = {
			transition: {
				duration,
				ease: "easeOut",
			},
		};

		const variants = {
			flip: {
				initial: { rotateX: 90, opacity: 0 },
				animate: { rotateX: 0, opacity: 1 },
				exit: { rotateX: -90, opacity: 0 },
				transition: { ...baseConfig.transition, ease: "easeInOut" },
			},
			slide: {
				initial: { y: 20, opacity: 0 },
				animate: { y: 0, opacity: 1 },
				exit: { y: -20, opacity: 0 },
				transition: baseConfig.transition,
			},
			fade: {
				initial: { opacity: 0 },
				animate: { opacity: 1 },
				exit: { opacity: 0 },
				transition: { ...baseConfig.transition, duration: duration * 0.6 },
			},
			"scale-bounce": {
				initial: { scale: 0.5, opacity: 0 },
				animate: { scale: 1, opacity: 1 },
				exit: { scale: 0.8, opacity: 0 },
				transition: {
					...baseConfig.transition,
					type: "spring",
					stiffness: 200,
					damping: 15,
				},
			},
		};

		return variants[animationType];
	}, [animationType, duration]);

	// animationType is part of the key so switching styles replays the swap.
	const key = `number-${value}-${animationType}`;

	return (
		<div className={`relative overflow-hidden ${className}`}>
			<AnimatePresence mode="wait">
				<motion.div
					key={key}
					initial="initial"
					animate="animate"
					exit="exit"
					variants={animationVariants}
					style={{
						perspective: 1000,
						transformStyle: "preserve-3d",
					}}
				>
					{value}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

/** Digit-by-digit animated number — each digit swaps on its own stagger. */
export function AnimatedNumberAdvanced({
	value: initialValue,
	animationType = "slide",
	className = "",
	duration = 0.4,
	staggerDelay = 0.05,
}: AnimatedNumberDisplayProps & { staggerDelay?: number }) {
	const digits = String(initialValue).split("");

	const animationVariants = useMemo(() => {
		const baseConfig = {
			transition: {
				duration,
				ease: "easeOut",
			},
		};

		const variants = {
			flip: {
				initial: { rotateX: 90, opacity: 0 },
				animate: { rotateX: 0, opacity: 1 },
				exit: { rotateX: -90, opacity: 0 },
				transition: { ...baseConfig.transition, ease: "easeInOut" },
			},
			slide: {
				initial: { y: 20, opacity: 0 },
				animate: { y: 0, opacity: 1 },
				exit: { y: -20, opacity: 0 },
				transition: baseConfig.transition,
			},
			fade: {
				initial: { opacity: 0 },
				animate: { opacity: 1 },
				exit: { opacity: 0 },
				transition: { ...baseConfig.transition, duration: duration * 0.6 },
			},
			"scale-bounce": {
				initial: { scale: 0.5, opacity: 0 },
				animate: { scale: 1, opacity: 1 },
				exit: { scale: 0.8, opacity: 0 },
				transition: {
					...baseConfig.transition,
					type: "spring",
					stiffness: 200,
					damping: 15,
				},
			},
		};

		return variants[animationType];
	}, [animationType, duration]);

	return (
		<div className={`flex ${className}`}>
			{/* popLayout (not "wait"): multiple digit children animate together,
			    staggered; exiting chars leave the flow so siblings don't jump.
			    Mount animates too, so a remount replays the entrance. */}
			<AnimatePresence mode="popLayout">
				{digits.map((digit, index) => (
					<motion.div
						key={`${initialValue}-${animationType}-${index}`}
						initial="initial"
						animate="animate"
						exit="exit"
						variants={animationVariants}
						// @ts-expect-error variants carry a `transition` key that isn't part of the Variants type
						transition={{
							...animationVariants.transition,
							delay: index * staggerDelay,
						}}
						style={{
							perspective: 1000,
							transformStyle: "preserve-3d",
						}}
					>
						{digit}
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}

/** Lightweight counter with smooth number transitions. */
export function SmoothCounter({
	value,
	animationType = "slide",
	className = "",
	showDelta = false,
	duration,
}: AnimatedNumberDisplayProps & { showDelta?: boolean }) {
	return (
		<motion.div
			className={className}
			layout
			transition={{ type: "spring", stiffness: 200, damping: 20 }}
		>
			<AnimatedNumber
				value={value}
				animationType={animationType}
				className="font-medium"
				duration={duration}
			/>
		</motion.div>
	);
}
