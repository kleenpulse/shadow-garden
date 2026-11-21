import { registry } from "@/lib/registry";
import { inShadcnRegistry, shadcnIndexItem } from "@/lib/registry/shadcn";
import { SITE_URL } from "@/lib/site";

// The shadcn registry catalog: what `shadcn search`, `shadcn list` and the
// shadcn MCP server read before they fetch an item from /r/<slug>.json.
// Registry-only, like /llms.txt, so Cache Components prerenders it at build and
// the barrel's Landing Pages hide applies on its own. Items carry no file
// contents: the shadcn directory requires that of a listed registry.

export function GET(): Response {
	return Response.json(
		{
			$schema: "https://ui.shadcn.com/schema/registry.json",
			name: "motion-garden",
			homepage: SITE_URL,
			items: registry.filter(inShadcnRegistry).map(shadcnIndexItem),
		},
		{ headers: { "Access-Control-Allow-Origin": "*" } },
	);
}
