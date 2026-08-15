/**
 * Generates (and checks) the data-driven message namespaces from the English
 * source of truth in lib/registry, lib/cookbook and lib/collections.
 *
 *   bun scripts/i18n/gen-catalog.ts          # write mode
 *   bun scripts/i18n/gen-catalog.ts --check  # CI gate (part of `bun run check`)
 *
 * Write mode:
 *  - replaces the generated namespaces in messages/en.json wholesale
 *    (catalog / cookbookSections / cookbookTerms / collections /
 *    collectionGroups), leaving hand-authored namespaces untouched
 *  - reshapes every sibling catalog into en.json's exact key order,
 *    preserving existing translations and filling new keys with English
 *
 * Check mode verifies three invariants and exits non-zero on any failure:
 *  1. en.json's generated namespaces exactly match the data (no drift)
 *  2. every sibling catalog has the exact same leaf-key set as en.json
 *  3. no catalog value is an empty string
 *
 * Keys are slug-derived and stable; display copy is the only thing that varies
 * per locale. Consumed at render time via lib/i18n/data-copy.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "../../lib/registry";
import { COOKBOOK, termAnchor } from "../../lib/cookbook";
import { COLLECTIONS, COLLECTION_GROUPS } from "../../lib/collections";

const MSG_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../lib/i18n/messages",
);
const LOCALES = ["en", "es", "fr", "ja", "zh", "ar"] as const;
const GENERATED_NAMESPACES = [
	"catalog",
	"cookbookSections",
	"cookbookTerms",
	"collections",
	"collectionGroups",
] as const;

type Tree = { [key: string]: string | Tree };

const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

function buildGenerated(): Record<(typeof GENERATED_NAMESPACES)[number], Tree> {
	const catalog: Tree = {};
	for (const entry of registry) {
		const props: Tree = {};
		for (const prop of entry.props) props[prop.name] = prop.description;
		catalog[entry.slug] = { description: entry.description, props };
	}

	const cookbookSections: Tree = {};
	const cookbookTerms: Tree = {};
	for (const section of COOKBOOK) {
		cookbookSections[slugify(section.title)] = {
			title: section.title,
			blurb: section.blurb,
		};
		for (const t of section.terms) cookbookTerms[termAnchor(t.term)] = t.description;
	}

	const collections: Tree = {};
	for (const c of COLLECTIONS) {
		collections[c.slug] = { title: c.title, intro: c.intro };
	}

	// COLLECTION_GROUPS is a plain string tuple ("By Category", …)
	const collectionGroups: Tree = {};
	for (const g of COLLECTION_GROUPS) {
		collectionGroups[slugify(g)] = g;
	}

	return { catalog, cookbookSections, cookbookTerms, collections, collectionGroups };
}

const readJson = (p: string): Tree =>
	JSON.parse(readFileSync(p, "utf8")) as Tree;
const writeJson = (p: string, o: Tree) =>
	writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`, "utf8");

/** en's shape, locale's values where present, en fill otherwise. */
function reshape(en: Tree, loc: Tree | undefined): Tree {
	const out: Tree = {};
	for (const [k, v] of Object.entries(en)) {
		const lv = loc?.[k];
		out[k] =
			typeof v === "object"
				? reshape(v, typeof lv === "object" ? lv : undefined)
				: typeof lv === "string"
					? lv
					: v;
	}
	return out;
}

function leafPaths(node: Tree, prefix = "", acc: string[] = []): string[] {
	for (const [k, v] of Object.entries(node)) {
		const p = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "object") leafPaths(v, p, acc);
		else acc.push(p);
	}
	return acc;
}

const check = process.argv.includes("--check");
const generated = buildGenerated();
const enPath = join(MSG_DIR, "en.json");
const en = readJson(enPath);

let failures = 0;
const fail = (msg: string) => {
	console.error(`  ✗ ${msg}`);
	failures++;
};

if (check) {
	for (const ns of GENERATED_NAMESPACES) {
		const want = JSON.stringify(generated[ns]);
		const have = JSON.stringify(en[ns] ?? {});
		if (want !== have)
			fail(
				`en.json "${ns}" drifted from the data — run: bun scripts/i18n/gen-catalog.ts`,
			);
	}
	const enLeaves = leafPaths(en).sort();
	for (const locale of LOCALES.slice(1)) {
		const loc = readJson(join(MSG_DIR, `${locale}.json`));
		const locLeaves = leafPaths(loc).sort();
		if (JSON.stringify(enLeaves) !== JSON.stringify(locLeaves)) {
			const enSet = new Set(enLeaves);
			const locSet = new Set(locLeaves);
			const missing = enLeaves.filter((p) => !locSet.has(p)).length;
			const extra = locLeaves.filter((p) => !enSet.has(p)).length;
			fail(`${locale}.json key set differs from en (missing ${missing}, extra ${extra})`);
		}
		for (const p of locLeaves) {
			let node: string | Tree = loc;
			for (const seg of p.split(".")) node = (node as Tree)[seg];
			if (node === "") fail(`${locale}.json ${p} is an empty string`);
		}
	}
	if (failures) {
		console.error(`i18n check: ${failures} failure(s)`);
		process.exit(1);
	}
	console.log("i18n check: catalogs in sync, key parity holds, no empty values.");
} else {
	for (const ns of GENERATED_NAMESPACES) en[ns] = generated[ns];
	writeJson(enPath, en);
	for (const locale of LOCALES.slice(1)) {
		const p = join(MSG_DIR, `${locale}.json`);
		writeJson(p, reshape(en, readJson(p)));
	}
	console.log(
		`generated ${leafPaths(generated.catalog).length} catalog + ${
			leafPaths(generated.cookbookTerms).length
		} term + ${leafPaths(generated.cookbookSections).length} section + ${
			leafPaths(generated.collections).length
		} collection keys into en.json; siblings reshaped.`,
	);
}
