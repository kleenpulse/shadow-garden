import { groupByCategory } from "@/lib/registry";
import type { ComponentEntry } from "@/lib/registry/types";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

// The index an agent reads first (https://llmstxt.org). Registry-only — no
// cookies, headers or searchParams — so Cache Components prerenders it at build,
// and it never carries source, so the Pro gate has nothing here to leak. The
// barrel's IS_LOCAL_DEV hide applies on its own: prod lists what prod ships.

// Several descriptions open with a two-word hook ("Molten chrome.") that says
// nothing an agent can choose by, so a short opening borrows the next sentence.
function summary(text: string): string {
	const [first, second] = text.split(/(?<=\.)\s/, 2);
	return first.length < 60 && second ? `${first} ${second}` : first;
}

function line(entry: ComponentEntry): string {
	const facts = [
		entry.props.length === 1 ? "1 prop" : `${entry.props.length} props`,
		...(entry.pro ? ["Pro"] : []),
	].join(", ");
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
		"- Every component page has a **Copy for Agent** button. It produces a complete integration brief: every source file (comments stripped), the full dependency install command, the props table with defaults and ranges, a usage snippet, and the integration rules the component depends on. If your user hasn't pasted one, ask them to; it is more reliable than scraping the page.",
		"- The source assumes React 19 with the Next.js App Router, strict TypeScript, and Tailwind CSS v4 (CSS-first, no config file). Adapt the integration to a different stack, but do not rewrite the animation math.",
		"- Entries marked Pro may gate their source and brief behind the Pro tier. Previews are always free.",
		"- Prop values are tunable live on each page, and the URL carries the tuned values.",
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
