import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import gsap from "gsap";

const AnimatedTitle = ({
	title,
	className,
}: {
	/** Markup, not plain text: <b> marks the letters that get the accent face. */
	title: string;
	className?: string;
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const ctx = gsap.context(() => {
			const titleAnimation = gsap.timeline({
				scrollTrigger: {
					trigger: containerRef.current,
					start: "100 bottom",
					end: "center bottom",
					toggleActions: "play none none reverse",
				},
			});

			titleAnimation.to(".animated-word", {
				opacity: 1,
				transform: "translate3d(0px, 0px, 0px) rotateY(0deg) rotateX(0deg)",
				ease: "power2.inOut",
				stagger: 0.02,
			});
		}, containerRef);
		return () => ctx.revert();
	}, []);

	return (
		<div ref={containerRef} className={cn("animated-title", className)}>
			{title.split("<br />").map((line: string, index: number) => (
				<div
					key={index}
					className="flex-center max-w-full flex-wrap gap-2 md:gap-3 px-10 "
				>
					{line.split(" ").map((word: string, i: number) => (
						<span
							key={i}
							className="animated-word"
							dangerouslySetInnerHTML={{ __html: word }}
						/>
					))}
				</div>
			))}
		</div>
	);
};

export default AnimatedTitle;
