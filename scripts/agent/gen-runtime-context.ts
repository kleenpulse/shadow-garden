// Writes (or checks) lib/agent/runtime-context.json: the text the browser
// runtime appends to an agent's instructions before it calls a model.
//
//   bun scripts/agent/gen-runtime-context.ts          # write
//   bun scripts/agent/gen-runtime-context.ts --check  # part of check:agent
//
// The free tier (lib/agent/free-tier.ts) serves a request only when its system
// message is exactly one of this site's agents: the instructions from the
// network file, then this text. The text is read from the vendored runtime
// itself, never retyped, so an updated runtime fails the check here instead of
// silently refusing every free request in production.
//
// Two parts make it, both from public/agent/runtime:
// - cruse.js agentPresentationContext(): one text for the front agent, whose
//   audience is the visitor, and one for any agent a parent agent calls.
// - runner.js: the note it adds when every site action is a website_* tool,
//   which is always the case on this site's own pages.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentPresentationContext } from "../../public/agent/runtime/cruse.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const OUT = path.join(root, "lib/agent/runtime-context.json");

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

export function runtimeContext(): { user: string; parent: string } {
	const runner = readFileSync(path.join(root, "public/agent/runtime/runner.js"), "utf8");
	const note = /: "(\\nWebsite operations are connected as website_\* tools\.[^"\n]*)";/.exec(runner);
	if (!note) {
		throw new Error("runner.js no longer holds the website-tools note this script reads. Read how it builds `websiteContext` and update gen-runtime-context.ts.");
	}
	const websiteNote = JSON.parse(`"${note[1]}"`) as string;
	const context = (frontAgent: boolean) =>
		agentPresentationContext(
			{
				network: { getAgentSpec: () => ({ instructions: "" }), config: { cruse: { version: 1 } } },
				isTop: true,
				frontMan: "front",
			},
			frontAgent ? "front" : "helper",
		) as string;
	const user = context(true);
	const parent = context(false);
	if (!user || !parent || user === parent) {
		throw new Error("agentPresentationContext() no longer gives one text per audience. Read cruse.js and update gen-runtime-context.ts.");
	}
	return { user: normalize(user + websiteNote), parent: normalize(parent + websiteNote) };
}

// Run directly, not imported: write or check.
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	const text = `${JSON.stringify(runtimeContext(), null, "\t")}\n`;
	if (process.argv.includes("--check")) {
		let current = "";
		try {
			current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
		} catch {}
		if (current !== text) {
			console.error("lib/agent/runtime-context.json is out of date with public/agent/runtime. Run: bun scripts/agent/gen-runtime-context.ts");
			process.exit(1);
		}
		console.log("runtime context: in step with the vendored runtime");
	} else {
		writeFileSync(OUT, text);
		console.log(`wrote ${path.relative(root, OUT)}`);
	}
}
