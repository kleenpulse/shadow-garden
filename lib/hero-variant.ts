// Which backdrop the landing hero runs. Selected by `?v=` and, on the page, by
// the readout strip's mode toggle. Deliberately not nuqs: nuqs reads
// useSearchParams, which under Cache Components turns everything up to the
// nearest Suspense boundary into a request-time hole — the hero is the LCP
// element and belongs in the static shell. Instead the pre-paint script below
// stamps <html data-sg-hero> (same mechanism as the sidebar / intro / locale
// scripts in app/layout.tsx) and React subscribes to this module through
// useSyncExternalStore. Framework-free so the page can embed the script.
export const HERO_VARIANTS = ["classic", "scroll"] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];
/** What a bare `/` runs. The default never appears in the URL. */
export const HERO_VARIANT_DEFAULT: HeroVariant = "scroll";
export const HERO_VARIANT_PARAM = "v";
export const HERO_VARIANT_ATTR = "data-sg-hero";

const CHANGE_EVENT = "sg-hero-variant";

/** Anything that is not a known variant is the default. */
export function parseHeroVariant(raw: string | null | undefined): HeroVariant {
	return (HERO_VARIANTS as readonly string[]).includes(raw ?? "")
		? (raw as HeroVariant)
		: HERO_VARIANT_DEFAULT;
}

/** Client-only. The server snapshot is always the default. */
export function readHeroVariant(): HeroVariant {
	if (typeof window === "undefined") return HERO_VARIANT_DEFAULT;
	return parseHeroVariant(
		new URLSearchParams(window.location.search).get(HERO_VARIANT_PARAM),
	);
}

/** The html attribute is the single visual source of truth for the toggle
 *  (see the hero-scroll variant in globals.css), so it is kept in step here
 *  rather than by whichever component happens to render. Classic is the
 *  absence of the attribute: it is the hero as it was before the traveler. */
export function stampHeroVariant(variant: HeroVariant): void {
	const el = document.documentElement;
	if (variant === "classic") el.removeAttribute(HERO_VARIANT_ATTR);
	else el.setAttribute(HERO_VARIANT_ATTR, variant);
}

/** Writes the URL without a navigation. Next patches history.replaceState and
 *  keeps its own router state as long as the existing state object is passed
 *  back, which is why `history.state` is forwarded verbatim. The default clears
 *  the param so the canonical URL never carries it. */
export function setHeroVariant(variant: HeroVariant): void {
	const url = new URL(window.location.href);
	if (variant === HERO_VARIANT_DEFAULT) url.searchParams.delete(HERO_VARIANT_PARAM);
	else url.searchParams.set(HERO_VARIANT_PARAM, variant);
	window.history.replaceState(window.history.state, "", url);
	stampHeroVariant(variant);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeHeroVariant(onChange: () => void): () => void {
	window.addEventListener(CHANGE_EVENT, onChange);
	window.addEventListener("popstate", onChange);
	return () => {
		window.removeEventListener(CHANGE_EVENT, onChange);
		window.removeEventListener("popstate", onChange);
	};
}

/** Pre-paint: stamp html[data-sg-hero] from ?v= so the mode toggle's active
 *  state and the translucent surfaces are right on the first frame. The
 *  whitelist and the default are embedded from the constants above so the
 *  script and the parser can never disagree. */
export function heroVariantInitScript(): string {
	const allowed = JSON.stringify(HERO_VARIANTS);
	return `try{var v=new URLSearchParams(location.search).get('${HERO_VARIANT_PARAM}');if(${allowed}.indexOf(v)<0){v='${HERO_VARIANT_DEFAULT}'}if(v!=='classic'){document.documentElement.setAttribute('${HERO_VARIANT_ATTR}',v)}}catch(e){}`;
}
