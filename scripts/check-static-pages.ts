// bun run check:static: run after `next build`. Fails when a prebuilt page still
// has a part that a function must fill on every request.
//
// Under Cache Components a page can be built ahead of time and still keep such
// a part (an uncached file read or fetch in a server component is enough). Next
// gives no warning: the route table prints the same symbol either way. On
// Netlify a page like that answers `private, no-store`, so every view of it is
// a function call. The build's own record tells the two apart: a whole page is
// `compute: "static"` in .next/prerender-manifest.json, a page with a
// request-time part is `"resuming"`.
//
// To fix a failure, move the read into a "use cache" function, as
// lib/registry/cached.ts does for the component page.
//
// It also fails when a prebuilt page or route handler revalidates by time (see
// the end).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Route = { routeType?: string; compute?: string; initialRevalidateSeconds?: number | false };

const file = path.join(process.cwd(), ".next", "prerender-manifest.json");
if (!existsSync(file)) {
	console.error("check:static: no .next/prerender-manifest.json. Run `bun run build` first.");
	process.exit(1);
}

const routes = Object.entries(
	(JSON.parse(readFileSync(file, "utf8")) as { routes: Record<string, Route> }).routes,
);
const pages = routes.filter(([, route]) => route.routeType === "page");
const computed = pages.filter(([, route]) => typeof route.compute === "string");

// A build record without the field cannot be judged. Say so and fail, so a
// Next.js upgrade that renames it is noticed and this check is not trusted blind.
if (pages.length === 0 || computed.length !== pages.length) {
	console.error(
		`check:static: ${pages.length - computed.length} of ${pages.length} pages carry no "compute" field. The build record's shape has changed; update scripts/check-static-pages.ts.`,
	);
	process.exit(1);
}

const open = pages.filter(([, route]) => route.compute !== "static").map(([name]) => name);
if (open.length > 0) {
	const groups = new Map<string, number>();
	for (const name of open) {
		const group = name.replace(/\/[^/]+$/, "/*");
		groups.set(group, (groups.get(group) ?? 0) + 1);
	}
	console.error(`check:static: ${open.length} of ${pages.length} prebuilt pages need a function on every view:`);
	for (const [group, count] of groups) console.error(`  ${group} (${count})`);
	process.exit(1);
}

// A page or route handler that revalidates by time is still a file, but
// Netlify's runtime handles it badly (measured with `cacheLife("max")`, 30 days).
// A page's prefetch data is treated as stale and never stored, so every prefetch
// of the page runs a function. A route handler's answer arrives already stale
// after a deploy and takes two function calls before it is stored. A cached
// read that cannot change inside a deploy should never revalidate:
// `cacheLife(UNTIL_NEXT_DEPLOY)` from lib/cache-life.ts.
const handlers = routes.filter(([, route]) => route.routeType === "route");
const timed = [...pages, ...handlers]
	.filter(([, route]) => typeof route.initialRevalidateSeconds === "number")
	.map(([name]) => name);
if (timed.length > 0) {
	console.error(
		`check:static: ${timed.length} of ${pages.length + handlers.length} prebuilt pages and route handlers revalidate by time, so the CDN does not keep them as built (first: ${timed[0]}).`,
	);
	process.exit(1);
}

console.log(
	`check:static: ${pages.length} prebuilt pages and ${handlers.length} prebuilt route handlers, all served as files that never revalidate`,
);
