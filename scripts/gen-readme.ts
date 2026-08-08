/**
 * Regenerates the "What's inside" catalog block in README.md from the registry,
 * so component counts and names never drift as components are added.
 *
 * Run: `bun run readme`. Edit the registry (lib/registry/index.ts), not the block.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registry } from "../lib/registry/index";
import { CATEGORY_ORDER } from "../lib/registry/types";

const START = "<!-- catalog:start -->";
const END = "<!-- catalog:end -->";

// Editorial voice per category — not derivable from the registry, rarely changes.
const BLURB: Record<string, string> = {
	Backgrounds: "WebGL/canvas ambience",
	"Text Animations": "type in motion",
	"Micro-interactions": "small mechanisms, felt more than seen",
	"Power-User Systems": "command surfaces for operators",
};

const total = registry.length;

const bullets = CATEGORY_ORDER.map((category) => {
	const inCat = registry.filter((c) => c.category === category);
	const blurb = BLURB[category];
	const lead = blurb ? ` — ${blurb}` : "";
	return `- **${category}** (${inCat.length})${lead}`;
}).join("\n");

const block = `${START}
**${total} components** across ${CATEGORY_ORDER.length} categories:

${bullets}

Browse the full catalog with live previews by running the dev server (see below).
${END}`;

const readmePath = join(dirname(fileURLToPath(import.meta.url)), "..", "README.md");
const readme = readFileSync(readmePath, "utf8");

if (!readme.includes(START) || !readme.includes(END)) {
	console.error(`README.md missing catalog markers (${START} … ${END}).`);
	process.exit(1);
}

const next = readme.replace(
	new RegExp(`${START}[\\s\\S]*?${END}`),
	() => block,
);

if (next === readme) {
	console.log("README catalog already up to date.");
} else {
	writeFileSync(readmePath, next);
	console.log(`README catalog regenerated: ${total} components.`);
}
