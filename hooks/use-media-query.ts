"use client";

import { useEffect, useState } from "react";

// SSR-safe media-query hook. Starts false (the server can't know the viewport),
// then syncs on mount and tracks changes. Modeled on usePrefersReducedMotion.
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);
	useEffect(() => {
		const media = window.matchMedia(query);
		const update = () => setMatches(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, [query]);
	return matches;
}
