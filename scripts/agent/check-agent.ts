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

check("manifest, network and sample queries agree", () => {
	const root = fileURLToPath(new URL("../../public/agent/", import.meta.url));
	const manifest = JSON.parse(readFileSync(path.join(root, "agent-manifest.json"), "utf8"));
	const network = manifest.networks[0];
	assert.equal(network.name, "motion_garden");
	const hocon = readFileSync(path.join(root, "motion_garden.hocon"), "utf8");
	for (const query of network.sample_queries) assert.ok(hocon.includes(JSON.stringify(query)), query);
	const actions = readFileSync(path.join(root, "site-actions.js"), "utf8") + readFileSync(path.join(root, "garden-data.js"), "utf8");
	for (const tool of manifest.actions.agentTools) assert.ok(actions.includes(`name: "${tool}"`), tool);
});

console.log(`check:agent: ${passed} checks passed`);
