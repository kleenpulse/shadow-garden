import type { NextRequest } from "next/server";
import { getEntry } from "@/lib/registry";
import { getPrompt } from "@/lib/registry/prompt";
import { getSource } from "@/lib/registry/source";
import { describeEntry } from "@/lib/agent/describe";
import { splitParts } from "@/lib/agent/files";
import { absoluteUrl } from "@/lib/site";

// One entry for agents: the browser assistant (public/agent), other agentic
// sites through its bridge, and any tool that reads /llms.txt. Everything here
// is already public and MIT on the component page, so any origin may read it.
//
//   (no query)        controls, dependencies, install commands and files
//   ?brief=1          the "Copy for Agent" brief as JSON (full source, comments
//                     stripped). &max=<chars> leaves an oversized brief out.
//   ?file=<path>      one shipped file, in parts when it is long (&part=<n>)
//
// The same brief as text/markdown lives one segment down, in md/route.ts.
//
// The size limit belongs to the caller, not the endpoint: a chat tool result is
// capped by its runtime and paid for by the visitor's model, so the browser
// assistant sends max; a coding agent fetching the brief wants all of it.

const CORS = { "Access-Control-Allow-Origin": "*" };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

export async function GET(
	request: NextRequest,
	ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await ctx.params;
	const params = request.nextUrl.searchParams;
	const entry = getEntry(slug);
	if (!entry) {
		return json(
			{ ok: false, reason: `No component with the slug "${slug}". Search the catalog first.` },
			404,
		);
	}
	const described = describeEntry(entry, absoluteUrl);
	const unavailable = {
		ok: false,
		reason: "The source for this entry is not available right now.",
		page: described.page,
	};

	const file = params.get("file");
	if (file !== null) {
		const source = await getSource(entry);
		if (source.status !== "ok") return json(unavailable, 503);
		const found = source.files.find((candidate) => candidate.file === file);
		if (!found) {
			return json(
				{
					ok: false,
					reason: `"${file}" is not one of this component's files. Its files are: ${source.files.map((f) => f.file).join(", ")}.`,
					field: "file",
				},
				404,
			);
		}
		const parts = splitParts(found.raw);
		const part = params.has("part") ? Number(params.get("part")) : 1;
		if (!Number.isInteger(part) || part < 1 || part > parts.length) {
			return json(
				{
					ok: false,
					reason:
						parts.length === 1
							? "This file has 1 part."
							: `This file has ${parts.length} parts: send a part from 1 to ${parts.length}.`,
					field: "part",
				},
				400,
			);
		}
		return json({
			ok: true,
			slug: entry.slug,
			file: found.file,
			role: found.role,
			lang: found.lang,
			chars: found.raw.length,
			part,
			parts: parts.length,
			code: parts[part - 1],
		});
	}

	if (params.get("brief") !== "1") return json({ ok: true, ...described });

	const prompt = await getPrompt(entry);
	if (prompt.status !== "ok") return json(unavailable, 503);
	// The one-line shadcn install, so an answer about the code can lead with it.
	const shadcn = described.shadcn ? { shadcn: described.shadcn } : {};
	const max = Number(params.get("max"));
	if (Number.isFinite(max) && max > 0 && prompt.text.length > max) {
		const source = await getSource(entry);
		const files =
			source.status === "ok"
				? source.files.map((f) => ({
						file: f.file,
						role: f.role,
						chars: f.raw.length,
						parts: splitParts(f.raw).length,
					}))
				: described.files;
		const size = prompt.text.length.toLocaleString("en-US");
		return json({
			ok: true,
			slug: entry.slug,
			name: entry.name,
			page: described.page,
			markdown: described.markdown,
			install: described.install,
			...shadcn,
			files,
			briefIncluded: false,
			reason: `The integration brief is ${size} characters, over the ${max.toLocaleString("en-US")} asked for. The whole brief is at the markdown link, and the page's "Copy for Agent" button copies the same text. Each file can also be read on its own.`,
		});
	}
	return json({
		ok: true,
		slug: entry.slug,
		name: entry.name,
		page: described.page,
		markdown: described.markdown,
		...shadcn,
		briefIncluded: true,
		brief: prompt.text,
	});
}
