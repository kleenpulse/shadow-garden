"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
	HERO_VARIANT_DEFAULT,
	readHeroVariant,
	setHeroVariant,
	stampHeroVariant,
	subscribeHeroVariant,
	type HeroVariant,
} from "@/lib/hero-variant";

const serverSnapshot = (): HeroVariant => HERO_VARIANT_DEFAULT;

// The URL is the store. Server and hydration render the default; the client
// snapshot lands in the post-hydration re-render, which is before any
// viewport-gated backdrop mounts (useMediaQuery starts false), so nothing can
// mount under the wrong variant. The effect re-stamps the html attribute for
// soft navigations, where inline scripts do not run again.
export function useHeroVariant(): [HeroVariant, (next: HeroVariant) => void] {
	const variant = useSyncExternalStore(
		subscribeHeroVariant,
		readHeroVariant,
		serverSnapshot,
	);
	useEffect(() => {
		stampHeroVariant(variant);
	}, [variant]);
	return [variant, setHeroVariant];
}
