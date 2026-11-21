// What the agent learns about one entry. Built from the registry only, so it is
// the same facts the component page shows: controls, dependencies, install
// commands and the files that ship. Client-safe (no fs, no server-only).

import { installCommand, PKG_MANAGERS } from "../registry/install";
import type { ComponentEntry } from "../registry/types";
import { controlViews } from "./controls";
import { summarize } from "./search";

export function describeEntry(entry: ComponentEntry, absolute: (path: string) => string) {
	const path = `/components/${entry.slug}`;
	return {
		slug: entry.slug,
		name: entry.name,
		category: entry.category,
		kind: entry.kind ?? "component",
		summary: summarize(entry.description),
		description: entry.description,
		page: absolute(path),
		path,
		controls: controlViews(entry.props),
		dependencies: entry.dependencies ?? [],
		install: Object.fromEntries(PKG_MANAGERS.map((pm) => [pm, installCommand(pm, entry)])),
		files: entry.variants.map((variant) => ({
			file: variant.file,
			role: variant.role ?? "component",
		})),
		license: "MIT",
		...(entry.attribution ? { attribution: entry.attribution } : {}),
	};
}
