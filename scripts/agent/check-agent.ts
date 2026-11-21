// bun run check:agent: the browser agent's pure logic (lib/agent) against the
// real registry. Runs under plain bun like the other check scripts, so every
// entry is in (Landing Pages included). Exits non-zero on the first failure.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registry, getEntry } from "../../lib/registry";
import type { ComponentEntry, PropSchema } from "../../lib/registry/types";
import { applyChanges, controlViews, queryFor } from "../../lib/agent/controls";
import { searchEntries } from "../../lib/agent/search";
import { describeEntry } from "../../lib/agent/describe";
import { PART_LIMIT, splitParts } from "../../lib/agent/files";
import { inShadcnRegistry, shadcnIndexItem, shadcnItem } from "../../lib/registry/shadcn";
import { stripComments } from "../../lib/registry/strip-comments";

let passed = 0;
function check(name: string, fn: () => void) {
	try {
		fn();
		passed++;
	} catch (error) {
		console.error(`✗ ${name}`);
		throw error;
	}
}

function entryWith(kind: PropSchema["kind"]): { entry: ComponentEntry; prop: PropSchema } {
	for (const entry of registry) {
		const prop = entry.props.find((p) => p.kind === kind && !p.sets && !p.disabledWhen);
		if (prop) return { entry, prop };
	}
	throw new Error(`no entry has a plain ${kind} control`);
}

// --- controls -------------------------------------------------------------

check("number in range is accepted, as a number", () => {
	const { entry, prop } = entryWith("number");
	if (prop.kind !== "number") throw new Error();
	const result = applyChanges(entry.props, {}, [{ name: prop.name, value: String(prop.max) }]);
	assert.equal(result.ok, true);
	if (result.ok) assert.equal(result.patch[prop.name], prop.max);
	const low = applyChanges(entry.props, {}, [{ name: prop.name, value: String(prop.min) }]);
	assert.equal(low.ok, true);
});

check("number out of range is refused with the range", () => {
	const { entry, prop } = entryWith("number");
	if (prop.kind !== "number") throw new Error();
	const result = applyChanges(entry.props, {}, [{ name: prop.name, value: String(prop.max + 1) }]);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.field, prop.name);
		assert.match(result.reason, new RegExp(String(prop.max)));
	}
	const nan = applyChanges(entry.props, {}, [{ name: prop.name, value: "fast" }]);
	assert.equal(nan.ok, false);
});

check("enum is matched case-insensitively and returns the real option", () => {
	const { entry, prop } = entryWith("enum");
	if (prop.kind !== "enum") throw new Error();
	const option = prop.options[prop.options.length - 1];
	const result = applyChanges(entry.props, {}, [{ name: prop.name, value: option.toUpperCase() }]);
	assert.equal(result.ok, true);
	if (result.ok) assert.equal(result.patch[prop.name], option);
	const bad = applyChanges(entry.props, {}, [{ name: prop.name, value: "definitely-not-an-option" }]);
	assert.equal(bad.ok, false);
});

check("boolean accepts true/false/on/off only", () => {
	const { entry, prop } = entryWith("boolean");
	for (const [text, value] of [["true", true], ["OFF", false], ["on", true], ["False", false]] as const) {
		const result = applyChanges(entry.props, {}, [{ name: prop.name, value: text }]);
		assert.equal(result.ok, true, text);
		if (result.ok) assert.equal(result.patch[prop.name], value);
	}
	assert.equal(applyChanges(entry.props, {}, [{ name: prop.name, value: "yes please" }]).ok, false);
});

check("color takes #rgb and #rrggbb, normalised to lowercase #rrggbb", () => {
	const { entry, prop } = entryWith("color");
	const short = applyChanges(entry.props, {}, [{ name: prop.name, value: "#A5F" }]);
	assert.equal(short.ok, true);
	if (short.ok) assert.equal(short.patch[prop.name], "#aa55ff");
	assert.equal(applyChanges(entry.props, {}, [{ name: prop.name, value: "purple" }]).ok, false);
	assert.equal(applyChanges(entry.props, {}, [{ name: prop.name, value: "#12345" }]).ok, false);
});

check("one bad change refuses the whole batch", () => {
	const { entry, prop } = entryWith("number");
	if (prop.kind !== "number") throw new Error();
	const result = applyChanges(entry.props, {}, [
		{ name: prop.name, value: String(prop.min) },
		{ name: "noSuchControl", value: "1" },
	]);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.field, "noSuchControl");
		assert.match(result.reason, new RegExp(prop.name));
	}
});

check("duplicate and empty batches are refused", () => {
	const { entry, prop } = entryWith("number");
	if (prop.kind !== "number") throw new Error();
	assert.equal(applyChanges(entry.props, {}, []).ok, false);
	const twice = applyChanges(entry.props, {}, [
		{ name: prop.name, value: String(prop.min) },
		{ name: prop.name, value: String(prop.max) },
	]);
	assert.equal(twice.ok, false);
});

check("a `sets` link is applied like the bench setter, unless set explicitly", () => {
	const linked = registry.flatMap((entry) => entry.props.filter((p) => p.sets).map((prop) => ({ entry, prop })))[0];
	if (!linked) return; // no entry uses `sets` today
	const value = linked.prop.kind === "enum" ? linked.prop.options[0] : String(linked.prop.default);
	const result = applyChanges(linked.entry.props, {}, [{ name: linked.prop.name, value }]);
	assert.equal(result.ok, true);
	if (result.ok) assert.equal(result.patch[linked.prop.sets!.prop], linked.prop.sets!.value);
});

check("every registry default round-trips through applyChanges", () => {
	for (const entry of registry) {
		for (const prop of entry.props) {
			const result = applyChanges(entry.props, {}, [{ name: prop.name, value: String(prop.default) }]);
			assert.equal(result.ok, true, `${entry.slug}.${prop.name} default ${String(prop.default)}`);
		}
	}
});

check("controlViews carries live values and ranges; queryFor drops defaults", () => {
	const { entry, prop } = entryWith("number");
	if (prop.kind !== "number") throw new Error();
	const views = controlViews(entry.props, { [prop.name]: prop.max });
	const view = views.find((v) => v.name === prop.name)!;
	assert.equal(view.value, prop.max);
	assert.equal(view.min, prop.min);
	assert.equal(queryFor(entry.props, { [prop.name]: prop.default }), "");
	assert.equal(queryFor(entry.props, { [prop.name]: prop.max }), `?${prop.name}=${prop.max}`);
});

// --- search ----------------------------------------------------------------

check("search finds components by name, slug and description words", () => {
	const top = (q: string) => searchEntries(registry, q, { limit: 3 }).map((hit) => hit.slug);
	assert.ok(top("magnetic button").includes("magnetic-button"), "magnetic button");
	assert.ok(top("waves background").includes("waves"), "waves background");
	assert.ok(top("command palette").includes("command-palette"), "command palette");
});

check("search returns nothing for nonsense, and respects category and limit", () => {
	assert.deepEqual(searchEntries(registry, "zzqqxv"), []);
	const hits = searchEntries(registry, "text", { category: "Text Animations", limit: 4 });
	assert.ok(hits.length > 0 && hits.length <= 4);
	assert.ok(hits.every((hit) => hit.category === "Text Animations"));
	assert.ok(searchEntries(registry, "animated", { limit: 99 }).length <= 12);
});

// --- describe + bundle -----------------------------------------------------

check("describeEntry exposes controls, deps, install and files from the registry", () => {
	const entry = getEntry("magnetic-button")!;
	const described = describeEntry(entry, (p) => `https://example.test${p}`);
	assert.equal(described.page, "https://example.test/components/magnetic-button");
	assert.equal(described.controls.length, entry.props.length);
	assert.deepEqual(described.dependencies, entry.dependencies ?? []);
	assert.equal(described.files[0].role, "component");
	assert.equal(Object.keys(described.install).length, 4);
});

check("describeEntry links the brief's Markdown twin", () => {
	const entry = getEntry("magnetic-button")!;
	const described = describeEntry(entry, (p) => `https://example.test${p}`);
	assert.equal(described.markdown, "https://example.test/components/magnetic-button.md");
});

check("describeEntry gives the shadcn install to components, not to templates", () => {
	const absolute = (p: string) => `https://example.test${p}`;
	const component = describeEntry(getEntry("magnetic-button")!, absolute);
	assert.equal(component.shadcn?.bun, "bunx shadcn@latest add https://example.test/r/magnetic-button.json");
	assert.equal(Object.keys(component.shadcn ?? {}).length, 4);
	const template = registry.find((entry) => entry.kind === "template");
	if (template) assert.equal("shadcn" in describeEntry(template, absolute), false);
});

check("the network's rules match what the site can do", () => {
	// The assistant only states what a tool result gives it, so a rule that says
	// "no CLI install" would hide the shadcn command the endpoints now return.
	const root = fileURLToPath(new URL("../../public/agent/", import.meta.url));
	const hocon = readFileSync(path.join(root, "motion_garden.hocon"), "utf8");
	const network = readFileSync(path.join(root, "motion_garden.network.json"), "utf8");
	for (const text of [hocon, network]) {
		assert.ok(!text.includes("install components through a CLI"), "stale no-CLI rule");
		assert.ok(text.includes("shadcn command"), "names the shadcn command");
		assert.ok(text.includes("website_get_component_file"), "names the file action");
	}
});

// --- files -----------------------------------------------------------------

check("splitParts cuts on line ends, keeps every byte and respects the limit", () => {
	assert.deepEqual(splitParts("short\n", 100), ["short\n"]);
	const text = Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(20)}\n`).join("");
	const parts = splitParts(text, 200);
	assert.ok(parts.length > 1);
	assert.equal(parts.join(""), text);
	for (const part of parts) {
		assert.ok(part.length <= 200, `part of ${part.length}`);
		assert.ok(part.endsWith("\n"), "a part ends where a line ends");
	}
});

check("splitParts cuts a line longer than the limit, losing nothing", () => {
	const text = `head\n${"y".repeat(950)}\ntail\n`;
	const parts = splitParts(text, 300);
	assert.equal(parts.join(""), text);
	assert.ok(parts.every((part) => part.length <= 300));
});

check("every shipped file fits the file action's part range", () => {
	// site-actions' get_component_file accepts part 1 to 20. The file on disk still
	// has its comments, so it is never shorter than what the endpoint serves.
	const repo = fileURLToPath(new URL("../../", import.meta.url));
	for (const entry of registry) {
		for (const variant of entry.variants) {
			const parts = splitParts(readFileSync(path.join(repo, variant.file), "utf8"));
			assert.ok(parts.length <= 20, `${variant.file}: ${parts.length} parts`);
			assert.ok(parts.every((part) => part.length <= PART_LIMIT));
		}
	}
});

// --- shadcn registry -------------------------------------------------------

check("every component maps to a shadcn item; templates stay out", () => {
	const listed = registry.filter(inShadcnRegistry);
	assert.ok(listed.length > 0 && listed.every((entry) => entry.kind !== "template"));
	for (const entry of listed) {
		const item = shadcnIndexItem(entry); // throws on a path with no target rule
		assert.equal(item.name, entry.slug);
		assert.equal(item.files[0].target, `@components/registry/${entry.slug}/${entry.variants[0].file.split("/").pop()}`);
		for (const file of item.files) {
			assert.match(file.target, /^@(components|hooks|ui)\/.+\.tsx?$/, `${entry.slug}: ${file.target}`);
			assert.equal("content" in file, false, "the catalog carries no file contents");
			assert.notEqual(file.path, "lib/utils.ts");
		}
	}
});

check("shadcn items ship every file with content, tokens in step and no stray packages", () => {
	const repo = fileURLToPath(new URL("../../", import.meta.url));
	const absolute = (p: string) => `https://example.test${p}`;
	for (const entry of registry.filter(inShadcnRegistry)) {
		const sources = entry.variants.map((variant) => ({
			file: variant.file,
			raw: stripComments(readFileSync(path.join(repo, variant.file), "utf8")),
		}));
		const item = shadcnItem(entry, sources, absolute);
		const shipped = sources.filter((source) => source.file !== "lib/utils.ts");
		assert.equal(item.files.length, shipped.length, entry.slug);
		assert.ok(item.files.every((file) => file.content && file.content.length > 0), entry.slug);
		for (const pkg of item.dependencies ?? []) {
			assert.ok((entry.dependencies ?? []).includes(pkg), `${entry.slug}: ${pkg}`);
		}
		// A project that keeps its own lib/utils.ts needs clsx and tailwind-merge
		// only when a shipped file imports them itself.
		const text = shipped.map((source) => source.raw).join("\n");
		for (const pkg of ["clsx", "tailwind-merge"]) {
			const imported = new RegExp(`from\\s*["']${pkg}["']`).test(text);
			const hasUtils = sources.length !== shipped.length;
			if (hasUtils && !imported) assert.ok(!(item.dependencies ?? []).includes(pkg), `${entry.slug}: ${pkg}`);
		}
		const { theme = {}, light = {}, dark = {} } = item.cssVars ?? {};
		assert.deepEqual(Object.keys(light), Object.keys(dark), `${entry.slug}: light and dark keys`);
		for (const [key, value] of Object.entries(theme)) {
			const ref = /^var\(--(sg-[a-z-]+)\)$/.exec(value)?.[1];
			if (ref) assert.ok(ref in light, `${entry.slug}: ${key} points at --${ref}, which the item does not set`);
		}
		assert.equal(item.meta?.brief, `https://example.test/components/${entry.slug}.md`);
	}
});

check("shadcn item for a token user carries its theme, and one without tokens carries none", () => {
	const repo = fileURLToPath(new URL("../../", import.meta.url));
	const build = (entry: ComponentEntry) =>
		shadcnItem(
			entry,
			entry.variants.map((variant) => ({
				file: variant.file,
				raw: stripComments(readFileSync(path.join(repo, variant.file), "utf8")),
			})),
			(p) => `https://example.test${p}`,
		);
	const items = registry.filter(inShadcnRegistry).map(build);
	const themed = items.find((item) => item.cssVars?.theme?.["color-ink"]);
	assert.ok(themed, "some component uses text-ink");
	assert.equal(themed.cssVars?.theme?.["color-ink"], "var(--sg-ink)");
	assert.match(themed.cssVars?.light?.["sg-ink"] ?? "", /^#[0-9a-f]{6}$/);
	assert.ok(items.some((item) => !item.cssVars && !item.css), "some component needs no tokens");
	const utility = items.find((item) => item.css);
	assert.ok(utility && Object.keys(utility.css!).every((key) => key.startsWith("@utility ")));
});

check("manifest, network and sample queries agree", () => {
	const root = fileURLToPath(new URL("../../public/agent/", import.meta.url));
	const manifest = JSON.parse(readFileSync(path.join(root, "agent-manifest.json"), "utf8"));
	const network = manifest.networks[0];
	assert.equal(network.name, "motion_garden");
	const hocon = readFileSync(path.join(root, "motion_garden.hocon"), "utf8");
	for (const query of network.sample_queries) assert.ok(hocon.includes(JSON.stringify(query)), query);
	const actions = readFileSync(path.join(root, "site-actions.js"), "utf8") + readFileSync(path.join(root, "garden-data.js"), "utf8");
	for (const tool of manifest.actions.agentTools) assert.ok(actions.includes(`name: "${tool}"`), tool);
	// Every catalog read in garden-data.js is registered on the page and shared
	// through the bridge; a read left out of either is a tool that silently fails.
	const data = readFileSync(path.join(root, "garden-data.js"), "utf8");
	const page = readFileSync(path.join(root, "site-actions.js"), "utf8");
	const bridge = readFileSync(path.join(root, "bridge", "bridge-actions.js"), "utf8");
	const reads = [...data.matchAll(/static (\w+Action)\(/g)].map((match) => match[1]);
	assert.ok(reads.length >= 4, "garden-data.js declares its reads");
	for (const read of reads) {
		assert.ok(page.includes(`GardenData.${read}(`), `site-actions.js registers ${read}`);
		assert.ok(bridge.includes(`GardenData.${read}(`), `bridge-actions.js shares ${read}`);
	}
});

console.log(`check:agent: ${passed} checks passed`);
