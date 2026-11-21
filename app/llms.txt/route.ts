import { groupByCategory } from "@/lib/registry";
import type { ComponentEntry } from "@/lib/registry/types";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

// The index an agent reads first (https://llmstxt.org). Registry-only — no
// cookies, headers or searchParams — so Cache Components prerenders it at build,
// and it stays an index: the source lives in each page's agent brief. The
// barrel's IS_LOCAL_DEV hide applies on its own: prod lists what prod ships.

// Several descriptions open with a two-word hook ("Molten chrome.") that says
// nothing an agent can choose by, so a short opening borrows the next sentence.
function summary(text: string): string {
	const [first, second] = text.split(/(?<=\.)\s/, 2);
	return first.length < 60 && second ? `${first} ${second}` : first;
}

function line(entry: ComponentEntry): string {
	const facts =
		entry.props.length === 1 ? "1 prop" : `${entry.props.length} props`;
	return `- [${entry.name}](${absoluteUrl(`/components/${entry.slug}`)}): ${summary(entry.description)} (${facts})`;
}

function body(): string {
	const groups = groupByCategory();
	return [
		`# ${SITE_NAME}`,
		"",
		`> ${SITE_DESCRIPTION}`,
		"",
		"## How to use this catalog",
		"",
		"- Every component page has a **Copy for Agent** button. It produces a complete integration brief: every source file (comments stripped), the full dependency install command, the props table with defaults and ranges, a usage snippet, and the integration rules the component depends on. If you can fetch URLs, add `.md` to a component link below to read the same brief as Markdown. If you cannot, ask your user to paste one. Both are more reliable than scraping the page.",
		"- The source assumes React 19 with the Next.js App Router, strict TypeScript, and Tailwind CSS v4 (CSS-first, no config file). Adapt the integration to a different stack, but do not rewrite the animation math.",
		"- Everything is free and MIT-licensed: previews, source, briefs and props.",
		"- Prop values are tunable live on each page, and the URL carries the tuned values.",
		"",
		"## Read the catalog as data",
		"",
		"These endpoints need no key and allow any origin. They return JSON unless noted. A slug is the last part of a component link below.",
		"",
		`- Brief as Markdown: \`GET ${absoluteUrl("/components")}/<slug>.md\` returns the whole Copy for Agent brief as \`text/markdown\`, whatever its size.`,
		`- Search: \`GET ${absoluteUrl("/api/agent/search")}?q=<words>\` finds components by what they do. Optional: \`category\` (one of: ${groups.map((group) => group.category).join(", ")}) and \`limit\` (1 to 12, default 6). Each result carries its slug, name, category and a one-line summary.`,
		`- Describe: \`GET ${absoluteUrl("/api/agent/component")}/<slug>\` returns the controls (name, kind, default, range or options), the npm dependencies, the install commands and the files that ship.`,
		`- Brief: \`GET ${absoluteUrl("/api/agent/component")}/<slug>/brief\` returns the same brief as JSON, in the \`brief\` field, with its size in \`chars\`, the install commands and each file's size.`,
		`- Source: \`GET ${absoluteUrl("/api/agent/component")}/<slug>/source\` returns every shipped file with comments stripped. Each file's \`parts\` is its text in pieces of up to 28,000 characters; join them for the whole file.`,
		`- shadcn registry: \`bunx shadcn@latest add ${absoluteUrl("/r")}/<slug>.json\` installs a component with the shadcn CLI: its files, its npm packages and the theme tokens it needs. The catalog is ${absoluteUrl("/r/registry.json")}. Whole-page templates are not in it.`,
		`- Tuned preview: each control is a query parameter, so \`${absoluteUrl("/components")}/<slug>?<control>=<value>\` opens the page with those values set.`,
		`- Agent network: ${absoluteUrl("/agent/agent-manifest.json")} describes the site's [open agentic web](https://github.com/cognizant-ai-labs/agentic-web) network. Other agentic websites can call it to search the catalog and fetch component code.`,
		"",
		...groups.flatMap((group) => [
			`## ${group.category}`,
			"",
			...group.entries.map(line),
			"",
		]),
		"## Optional",
		"",
		`- [Motion Cook Book](${absoluteUrl("/cookbook")}): the precise name for every web animation term (stagger, rubber-banding, spring damping, scrub…), linked to the components that demonstrate it. Use it to turn a vague request into the right component.`,
		`- [Collections](${absoluteUrl("/collections")}): curated families of components by category, technique and animation library.`,
		"",
	].join("\n");
}

export function GET(): Response {
	return new Response(body(), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
