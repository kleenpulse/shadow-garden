"use client";

import type { ReactNode } from "react";
import { useLenis } from "lenis/react";

// In-page anchor driven by lenis, matching GotoTop's glide. Without a lenis
// instance (reduced motion — SmoothScroll renders null), the click falls
// through to the native instant jump.
export default function SmoothAnchor({
	href,
	className,
	children,
}: {
	href: `#${string}`;
	className?: string;
	children: ReactNode;
}) {
	const lenis = useLenis();

	return (
		<a
			href={href}
			className={className}
			onClick={(e) => {
				if (!lenis) return;
				e.preventDefault();
				// scrollTo reads the target's scroll-margin-top, so scroll-mt-10 holds.
				lenis.scrollTo(href, {
					duration: 2,
					easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
				});
				history.pushState(null, "", href);
			}}
		>
			{children}
		</a>
	);
}
