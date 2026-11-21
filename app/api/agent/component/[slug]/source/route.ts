import { getEntry } from "@/lib/registry";
import { sourceDoc } from "@/lib/agent/component-docs";
import { everySlug, json, sourceUnavailable, unknownSlug } from "@/lib/agent/static-route";

// Every shipped file of one component, comments stripped, exactly as its page's
// Code tab shows them. Each file's `parts` is its text cut into pieces a chat
// tool result can carry; joined, they are the file. Static, one per slug: the
// caller picks the file and the part it wants.

export const generateStaticParams = everySlug;

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await ctx.params;
	if (!getEntry(slug)) return unknownSlug(slug);
	const doc = await sourceDoc(slug);
	return doc ? json(doc) : sourceUnavailable(slug);
}
