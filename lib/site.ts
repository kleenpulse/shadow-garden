// The site's own identity — origin, name, social handles. ∃! module owns it (§G3).
//
// Every absolute URL the site emits about itself resolves through here: canonicals,
// OG images, the sitemap, robots, JSON-LD, and the transactional email links. A
// second copy of this constant is how a deploy ends up serving `localhost:3000`
// canonicals to Google, so `lib/email/layout.ts` and `lib/registry/prompt.ts` both
// import it rather than reading the env twice.
//
// The fallback is the production origin, not localhost: an unset env on a real
// deploy must fail toward the right domain, never toward a dev address.

const FALLBACK = "https://shadow-garden-ui.vercel.app";

// A trailing slash on the env value turns every `${SITE_URL}/path` into a double
// slash, which is a different URL to a crawler.
function normalize(url: string): string {
	return url.replace(/\/+$/, "");
}

export const SITE_URL = normalize(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK);

export const SITE_NAME = "Shadow Garden";

export const SITE_TAGLINE =
	"Animated React components, live and tunable";

export const SITE_DESCRIPTION =
	"A tunable gallery of animation-forward React components. Preview live, dial in every parameter, copy the source. WebGL backgrounds, text animations, micro-interactions and command surfaces for React and Next.js.";

export const SITE_REPO = "https://github.com/kleenpulse/shadow-garden";

/** Absolute URL for a site-relative path. Leading slash optional. */
export function absoluteUrl(path = "/"): string {
	return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
