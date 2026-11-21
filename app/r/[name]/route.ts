import { getEntry } from "@/lib/registry";
import { getSource } from "@/lib/registry/source";
import { inShadcnRegistry, shadcnItem } from "@/lib/registry/shadcn";
import { absoluteUrl } from "@/lib/site";

// One component as a shadcn registry item: /r/<slug>.json. `shadcn add` takes
// this URL, and a project that names the registry in components.json installs
// the same item as @motion-garden/<slug>. Built per request from the same
// stripped sources as the Code tab (lib/registry/shadcn.ts), so nothing is
// generated or checked in. The catalog is the static route beside this one,
// registry.json.

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ name: string }> },
): Promise<Response> {
	const { name } = await ctx.params;
	const entry = name.endsWith(".json") ? getEntry(name.slice(0, -".json".length)) : undefined;
	if (!entry || !inShadcnRegistry(entry)) {
		return Response.json(
			{ error: `No registry item "${name}". The catalog is at ${absoluteUrl("/r/registry.json")}.` },
			{ status: 404, headers: CORS },
		);
	}
	const source = await getSource(entry);
	if (source.status !== "ok") {
		return Response.json(
			{ error: "The source for this item is not available right now." },
			{ status: 503, headers: CORS },
		);
	}
	return Response.json(shadcnItem(entry, source.files, absoluteUrl), { headers: CORS });
}
