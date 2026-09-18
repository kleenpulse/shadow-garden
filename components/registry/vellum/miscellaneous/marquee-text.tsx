"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

interface MarqueeTextProps {
	text: string;
	className?: string;
	style?: CSSProperties;
	speed?: number;
	gap?: number;
}

export function MarqueeText({
	text,
	className,
	style,
	speed = 45,
	gap = 40,
}: MarqueeTextProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const probeRef = useRef<HTMLSpanElement>(null);
	// Measures the actual rendered track width for duration calc only
	const trackRef = useRef<HTMLDivElement>(null);

	const [isMarquee, setIsMarquee] = useState(false);
	const [duration, setDuration] = useState(0);
	const [animName] = useState(
		() => `__mq_${Math.random().toString(36).slice(2, 7)}`,
	);

	useEffect(() => {
		const wrapper = wrapperRef.current;
		const probe = probeRef.current;
		if (!wrapper || !probe) return;

		const measure = () => {
			const lh = parseFloat(getComputedStyle(probe).lineHeight);
			const wraps = probe.scrollHeight > Math.ceil(lh) + 2;
			setIsMarquee(wraps);
		};

		const ro = new ResizeObserver(measure);
		ro.observe(wrapper);
		measure();
		return () => ro.disconnect();
	}, [text]);

	// Once marquee track is rendered, measure its real width for timing only
	useEffect(() => {
		if (isMarquee && trackRef.current) {
			// Track = 2 copies + 2 gaps. Half = one cycle length.
			const cycleWidth = trackRef.current.scrollWidth / 2;
			setDuration(cycleWidth / speed);
		}
	}, [isMarquee, text, gap, speed]);

	return (
		<div ref={wrapperRef} className="relative min-w-0 flex-1 overflow-hidden">
			{/* Invisible probe — measures natural wrap height */}
			<span
				ref={probeRef}
				aria-hidden="true"
				className={className}
				style={{
					...style,
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					visibility: "hidden",
					whiteSpace: "normal",
					pointerEvents: "none",
				}}
			>
				{text}
			</span>

			{isMarquee ? (
				<div
					className="overflow-hidden"
					style={{
						maskImage:
							"linear-gradient(to right, transparent 0%, black 10%, black 82%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to right, transparent 0%, black 10%, black 82%, transparent 100%)",
					}}
				>
					<style>{`
            @keyframes ${animName} {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
            }
          `}</style>

					<div
						ref={trackRef}
						className="flex whitespace-nowrap w-max"
						style={{
							animation:
								duration > 0
									? `${animName} ${duration}s linear infinite`
									: undefined,
							willChange: "transform",
						}}
					>
						<span className={className} style={style}>
							{text}
						</span>
						<span
							aria-hidden="true"
							style={{ display: "inline-block", width: gap, flexShrink: 0 }}
						/>
						<span className={className} style={style} aria-hidden="true">
							{text}
						</span>
						<span
							aria-hidden="true"
							style={{ display: "inline-block", width: gap, flexShrink: 0 }}
						/>
					</div>
				</div>
			) : (
				<h3 className={className} style={style}>
					{text}
				</h3>
			)}
		</div>
	);
}
