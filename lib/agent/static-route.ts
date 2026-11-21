import { getAllSlugs } from "@/lib/registry";
import { absoluteUrl } from "@/lib/site";

// Shared by the agent's per-component routes (app/api/agent/component/[slug]/*).
// They are public, MIT and the same for every caller, and they change only when
// the site is deployed, so each one is built ahead of time for every slug and
// served as a static file. A request for one costs no function call. Keep them
// that way: a handler here must not read the request (its query, headers or
// cookies), or the route goes back to running on every request.

/** Any origin may read the catalog. */
export const CORS = { "Access-Control-Allow-Origin": "*" };

/** One static response per entry in the catalog. */
export function everySlug(): { slug: string }[] {
	return getAllSlugs().map((slug) => ({ slug }));
}

export function json(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: CORS });
}

/** The answer for a slug the catalog does not have. */
export function unknownSlug(slug: string): Response {
	return json(
		{ ok: false, reason: `No component with the slug "${slug}". Search the catalog first.` },
		404,
	);
}

/** The answer when an entry's files cannot be read. */
export function sourceUnavailable(slug: string): Response {
	return json(
		{
			ok: false,
			reason: "The source for this entry is not available right now.",
			page: absoluteUrl(`/components/${slug}`),
		},
		503,
	);
}
