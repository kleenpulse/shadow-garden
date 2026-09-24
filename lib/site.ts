const FALLBACK = "https://shadow-garden-ui.vercel.app";

// A trailing slash on the env value turns every `${SITE_URL}/path` into a double
// slash, which is a different URL to a crawler.
function normalize(url: string): string {
	return url.replace(/\/+$/, "");
}

export const SITE_URL = normalize(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK);

export const SITE_NAME = "Motion Garden";

export const SITE_TAGLINE = "Animated React components, ready for your coding agent";

export const SITE_DESCRIPTION =
	"Animated React and Next.js components you can tune live, each with a one-click brief for your coding agent: full typed source, dependencies, props and integration rules. WebGL backgrounds, text animations, micro-interactions and command menus.";

export const SITE_REPO = "https://github.com/kleenpulse/shadow-garden";

/** Absolute URL for a site-relative path. Leading slash optional. */
export function absoluteUrl(path = "/"): string {
	return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
