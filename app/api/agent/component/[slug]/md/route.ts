import { getEntry } from "@/lib/registry";
import { getPrompt } from "@/lib/registry/prompt";
import { absoluteUrl } from "@/lib/site";

// The "Copy for Agent" brief as text/markdown, whatever its size. Its public
// address is /components/<slug>.md (a rewrite in next.config.ts), the page's
// Markdown twin under the llms.txt convention; the page names it in a
// <link rel="alternate">. It has its own route, not a query flag on the JSON
// endpoint beside it, because a rewrite's destination query does not reach the
// handler's request URL.

const CORS = { "Access-Control-Allow-Origin": "*" };

function plain(body: string, status: number): Response {
	return new Response(body, {
		status,
		headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
	});
}

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await ctx.params;
	const entry = getEntry(slug);
	if (!entry) {
		return plain(
			`No component with the slug "${slug}".\n\nThe catalog: ${absoluteUrl("/llms.txt")}\n`,
			404,
		);
	}
	const page = absoluteUrl(`/components/${entry.slug}`);
	const prompt = await getPrompt(entry);
	if (prompt.status !== "ok") {
		return plain(`The source for this entry is not available right now.\n\n${page}\n`, 503);
	}
	return new Response(prompt.text, {
		headers: {
			...CORS,
			"Content-Type": "text/markdown; charset=utf-8",
			// The page is the canonical document; this is the same facts for agents.
			Link: `<${page}>; rel="canonical"`,
		},
	});
}
