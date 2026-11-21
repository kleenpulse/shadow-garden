import { getEntry } from "@/lib/registry";
import { describeEntry } from "@/lib/agent/describe";
import { everySlug, json, unknownSlug } from "@/lib/agent/static-route";
import { absoluteUrl } from "@/lib/site";

// One entry for agents: the browser assistant (public/agent), other agentic
// sites through its bridge, and any tool that reads /llms.txt. Everything here
// is already public and MIT on the component page, so any origin may read it.
//
//   /api/agent/component/<slug>          controls, dependencies, install commands, files
//   /api/agent/component/<slug>/brief    the "Copy for Agent" brief as JSON
//   /api/agent/component/<slug>/source   every shipped file, in parts
//   /api/agent/component/<slug>/md       the brief as text/markdown (/components/<slug>.md)
//
// All four are static: built once per slug at deploy time (lib/agent/static-route.ts).
// A query string changes nothing; what a caller wants out of a document is
// picked on the caller's side.

export const generateStaticParams = everySlug;

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await ctx.params;
	const entry = getEntry(slug);
	if (!entry) return unknownSlug(slug);
	return json({ ok: true, ...describeEntry(entry, absoluteUrl) });
}
