import React, { useRef, useLayoutEffect, useState } from "react";
import {
	motion,
	useScroll,
	useSpring,
	useTransform,
	useMotionValue,
	useVelocity,
	useAnimationFrame,
} from "motion/react";
import { BrandMark } from "../miscellaneous/brand-mark";

interface VelocityMapping {
	input: [number, number];
	output: [number, number];
}

interface VelocityTextProps {
	children: React.ReactNode;
	baseVelocity: number;
	scrollContainerRef?: React.RefObject<HTMLElement>;
	className?: string;
	damping?: number;
	stiffness?: number;
	numCopies?: number;
	velocityMapping?: VelocityMapping;
	parallaxClassName?: string;
	scrollerClassName?: string;
	parallaxStyle?: React.CSSProperties;
	scrollerStyle?: React.CSSProperties;
}

interface Venue {
	name: string;
}

interface ScrollVelocityProps {
	scrollContainerRef?: React.RefObject<HTMLElement>;
	venues: Venue[];
	velocity?: number;
	className?: string;
	damping?: number;
	stiffness?: number;
	numCopies?: number;
	velocityMapping?: VelocityMapping;
	parallaxClassName?: string;
	scrollerClassName?: string;
	parallaxStyle?: React.CSSProperties;
	scrollerStyle?: React.CSSProperties;
}

function useElementWidth<T extends HTMLElement>(
	ref: React.RefObject<T | null>,
): number {
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		function updateWidth() {
			if (ref.current) {
				setWidth(ref.current.offsetWidth);
			}
		}
		updateWidth();
		window.addEventListener("resize", updateWidth);
		return () => window.removeEventListener("resize", updateWidth);
	}, [ref]);
	return width;
}

export const ScrollVelocity: React.FC<ScrollVelocityProps> = ({
	scrollContainerRef,
	venues = [],
	velocity = 50,
	className = "",
	damping = 50,
	stiffness = 400,
	numCopies = 6,
	velocityMapping = { input: [0, 1000], output: [0, 5] },
	parallaxClassName,
	scrollerClassName,
	parallaxStyle,
	scrollerStyle,
}) => {
	function VelocityText({
		children,
		baseVelocity = velocity,
		scrollContainerRef,
		className = "",
		damping,
		stiffness,
		numCopies,
		velocityMapping,
		parallaxClassName,
		scrollerClassName,
		parallaxStyle,
		scrollerStyle,
	}: VelocityTextProps) {
		const baseX = useMotionValue(0);
		const scrollOptions = scrollContainerRef
			? { container: scrollContainerRef }
			: {};
		const { scrollY } = useScroll(scrollOptions);
		const scrollVelocity = useVelocity(scrollY);
		const smoothVelocity = useSpring(scrollVelocity, {
			damping: damping ?? 50,
			stiffness: stiffness ?? 400,
		});
		const velocityFactor = useTransform(
			smoothVelocity,
			velocityMapping?.input || [0, 1000],
			velocityMapping?.output || [0, 5],
			{ clamp: false },
		);
		const copyRef = useRef<HTMLSpanElement>(null);
		const copyWidth = useElementWidth(copyRef);
		function wrap(min: number, max: number, v: number): number {
			const range = max - min;
			const mod = (((v - min) % range) + range) % range;
			return mod + min;
		}
		const x = useTransform(baseX, (v) => {
			if (copyWidth === 0) return "0px";
			return `${wrap(-copyWidth, 0, v)}px`;
		});
		const directionFactor = useRef<number>(1);
		useAnimationFrame((t, delta) => {
			let moveBy = directionFactor.current * baseVelocity * (delta / 1000);
			if (velocityFactor.get() < 0) {
				directionFactor.current = -1;
			} else if (velocityFactor.get() > 0) {
				directionFactor.current = 1;
			}
			moveBy += directionFactor.current * moveBy * velocityFactor.get();
			baseX.set(baseX.get() + moveBy);
		});
		const spans = [];
		for (let i = 0; i < numCopies!; i++) {
			spans.push(
				<span
					className={`shrink-0  flex items-center  ${className}`}
					key={i}
					ref={i === 0 ? copyRef : null}
				>
					{children}
				</span>,
			);
		}
		return (
			<div
				data-horizontal-mask
				className={`${parallaxClassName} relative overflow-hidden  `}
				style={parallaxStyle}
			>
				<motion.div
					className={`${scrollerClassName} flex items-center whitespace-nowrap text-center  md:text-3xl font-light tracking-[-0.02em] `}
					style={{ x, ...scrollerStyle }}
				>
					{spans}
				</motion.div>
			</div>
		);
	}
	return (
		<section className="bg-[var(--card)]  py-4 md:py-10 mt-2">
			<VelocityText
				className={className}
				baseVelocity={velocity}
				scrollContainerRef={scrollContainerRef}
				damping={damping}
				stiffness={stiffness}
				numCopies={numCopies}
				velocityMapping={velocityMapping}
				parallaxClassName={parallaxClassName}
				scrollerClassName={scrollerClassName}
				parallaxStyle={parallaxStyle}
				scrollerStyle={scrollerStyle}
			>
				{venues.map((venue: Venue, index: number) => (
					<span
						key={index}
						className="inline-flex justify-center items-center mr-8 md:mr-10 "
					>
						<BrandMark
							name={venue.name}
							className="inline-block size-[62px] [&>svg]:size-full"
						/>
					</span>
				))}
			</VelocityText>
		</section>
	);
};
export default ScrollVelocity;
