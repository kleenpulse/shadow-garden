/**
 * The one place the locale roster lives. UI language is client-owned: persisted
 * in localStorage (`sg-locale`, following the sg-ui / sg-favorites idiom — this
 * repo has no cookies and the server never needs the locale in client-provider
 * mode). Resolution: stored value → navigator.languages → 'en'.
 *
 * English remains the source of truth for every join key in the data layer —
 * registry slugs, cookbook terms, category names, URL anchors. Catalogs only
 * carry *display* copy; nothing here may leak into lib/registry, lib/cookbook
 * or lib/collections (those must stay importable under plain `bun`).
 */

export const LOCALES = [
	{ code: "en", nativeName: "English", englishName: "English", badge: "GB", dir: "ltr" },
	{ code: "es", nativeName: "Español", englishName: "Spanish", badge: "ES", dir: "ltr" },
	{ code: "fr", nativeName: "Français", englishName: "French", badge: "FR", dir: "ltr" },
	{ code: "ja", nativeName: "日本語", englishName: "Japanese", badge: "JP", dir: "ltr" },
	{ code: "zh", nativeName: "中文", englishName: "Chinese", badge: "CN", dir: "ltr" },
	{ code: "ar", nativeName: "العربية", englishName: "Arabic", badge: "SA", dir: "rtl" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

/** Document direction for a locale — 'rtl' only for Arabic today. */
export function dirFor(locale: Locale): "ltr" | "rtl" {
	return LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}

export const DEFAULT_LOCALE: Locale = "en";

/** localStorage key. Plain string value (not zustand-persist JSON) — the
 *  pre-paint script and the provider both read it with one `getItem`. */
export const LOCALE_STORAGE_KEY = "sg-locale";

export function isLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" && LOCALES.some((l) => l.code === value)
	);
}

/** Best match from the browser's language list, else 'en'. */
export function resolveBrowserLocale(
	languages: readonly string[],
): Locale {
	for (const lang of languages) {
		const base = lang.toLowerCase().split("-")[0];
		if (isLocale(base)) return base;
	}
	return DEFAULT_LOCALE;
}

export function readStoredLocale(): Locale | null {
	try {
		const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
		return isLocale(raw) ? raw : null;
	} catch {
		return null;
	}
}

export function writeStoredLocale(locale: Locale): void {
	try {
		localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {
		/* storage unavailable — locale stays session-only */
	}
}

/**
 * Pre-paint `<html lang>` stamp, mirroring catalogFilterScript(): read the
 * stored locale before first paint so the document language is right from the
 * start. Text still renders English until hydration (client-provider mode) —
 * same accepted class of flash as the theme script.
 */
export function localeInitScript(): string {
	const codes = JSON.stringify(LOCALES.map((l) => l.code));
	return `try{var l=localStorage.getItem('${LOCALE_STORAGE_KEY}');if(${codes}.indexOf(l)>-1&&l!=='en'){document.documentElement.lang=l;if(l==='ar'){document.documentElement.dir='rtl'}}}catch(e){}`;
}
