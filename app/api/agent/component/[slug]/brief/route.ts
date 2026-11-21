import { getEntry } from "@/lib/registry";
import { briefDoc } from "@/lib/agent/component-docs";
import { everySlug, json, sourceUnavailable, unknownSlug } from "@/lib/agent/static-route";

// The "Copy for Agent" brief as JSON, whatever its size, with the install
// commands and each file's size beside it. Static, one per slug. A chat tool
// result is capped by its runtime and paid for by the visitor's model, so the
// browser assistant leaves an oversized brief out on its own side
// (public/agent/garden-data.js); a coding agent fetching this wants all of it.

export const generateStaticParams = everySlug;

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await ctx.params;
	if (!getEntry(slug)) return unknownSlug(slug);
	const doc = await briefDoc(slug);
	return doc ? json(doc) : sourceUnavailable(slug);
}
