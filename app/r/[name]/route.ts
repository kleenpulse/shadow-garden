import { getEntry, registry } from "@/lib/registry";
import { inShadcnRegistry } from "@/lib/registry/shadcn";
import { shadcnDoc } from "@/lib/agent/component-docs";
import { absoluteUrl } from "@/lib/site";

// One component as a shadcn registry item: /r/<slug>.json. `shadcn add` takes
// this URL, and a project that names the registry in components.json installs
// the same item as @motion-garden/<slug>. Built from the same stripped sources
// as the Code tab (lib/registry/shadcn.ts), so nothing is generated or checked
// in. Static: every item is built once at deploy time, so an install costs no
// function call. The handler must not read the request, or that is lost. The
// catalog is the static route beside this one, registry.json.

const CORS = { "Access-Control-Allow-Origin": "*" };

export function generateStaticParams(): { name: string }[] {
	return registry.filter(inShadcnRegistry).map((entry) => ({ name: `${entry.slug}.json` }));
}

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ name: string }> },
): Promise<Response> {
	const { name } = await ctx.params;
	const slug = name.endsWith(".json") ? name.slice(0, -".json".length) : "";
	const entry = getEntry(slug);
	if (!entry || !inShadcnRegistry(entry)) {
		return Response.json(
			{ error: `No registry item "${name}". The catalog is at ${absoluteUrl("/r/registry.json")}.` },
			{ status: 404, headers: CORS },
		);
	}
	const item = await shadcnDoc(slug);
	if (!item) {
		return Response.json(
			{ error: "The source for this item is not available right now." },
			{ status: 503, headers: CORS },
		);
	}
	return Response.json(item, { headers: CORS });
}
