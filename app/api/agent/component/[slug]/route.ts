import type { NextRequest } from "next/server";
import { getEntry } from "@/lib/registry";
import { getPrompt } from "@/lib/registry/prompt";
import { describeEntry } from "@/lib/agent/describe";
import { absoluteUrl } from "@/lib/site";

// One entry for the browser agent (public/agent): its controls, dependencies,
// install commands and files, and with ?brief=1 the same "Copy for Agent" brief
// the page serves (full source, comments stripped). Everything here is already
// public and MIT on the component page, so any origin may read it.

// A tool result is capped at 64 KB by the runtime and every byte is paid for by
// the visitor's model. Briefs above this go to the page's Copy for Agent button.
const BRIEF_LIMIT = 30_000;

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(
	request: NextRequest,
	ctx: RouteContext<"/api/agent/component/[slug]">,
): Promise<Response> {
	const { slug } = await ctx.params;
	const entry = getEntry(slug);
	if (!entry) {
		return Response.json(
			{ ok: false, reason: `No component with the slug "${slug}". Search the catalog first.` },
			{ status: 404, headers: CORS },
		);
	}
	const described = describeEntry(entry, absoluteUrl);
	if (request.nextUrl.searchParams.get("brief") !== "1") {
		return Response.json({ ok: true, ...described }, { headers: CORS });
	}

	const prompt = await getPrompt(entry);
	if (prompt.status !== "ok") {
		return Response.json(
			{ ok: false, reason: "The source for this entry is not available right now.", page: described.page },
			{ status: 503, headers: CORS },
		);
	}
	if (prompt.text.length > BRIEF_LIMIT) {
		return Response.json(
			{
				ok: true,
				slug: entry.slug,
				name: entry.name,
				page: described.page,
				files: described.files,
				install: described.install,
				briefIncluded: false,
				reason: `The integration brief is ${prompt.text.length.toLocaleString("en-US")} characters, too large for a chat. Open the page and press "Copy for Agent" to get it.`,
			},
			{ headers: CORS },
		);
	}
	return Response.json(
		{ ok: true, slug: entry.slug, name: entry.name, page: described.page, briefIncluded: true, brief: prompt.text },
		{ headers: CORS },
	);
}
