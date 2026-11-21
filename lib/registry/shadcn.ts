// A registry entry as a shadcn registry item (https://ui.shadcn.com/docs/registry),
// so `shadcn add <site>/r/<slug>.json` installs it and the shadcn MCP server can
// list it. Derived, never authored twice: the same variants, dependencies and
// bench tokens that write the Code tab and the agent brief write this.
//
// Free of React, Next and `server-only`, relative imports only: app/r serves it
// and scripts/agent/check-agent.ts checks it under plain bun.
//
// How the shadcn CLI treats what is built here (read from its source at 4.23):
// - A typed file with an `@components/` / `@hooks/` / `@ui/` target lands inside
//   the project's own alias for that kind, and its `@/…` imports are rewritten
//   to the same aliases, so paths and imports stay in step in any layout.
// - A file whose content already matches is skipped without a prompt, so the
//   shared hook can ship inside every item that needs it.
// - For a component item, theme variables the project already defines are kept.
//   `--color-accent` exists in every shadcn project, so ours never replaces it.

import {
	tokenVars,
	tokensUsed,
	usesDisplayFont,
	usesTokens,
	type CssRule,
} from "./bench-tokens";
import { PKG_MANAGERS, type PkgManager } from "./install";
import type { ComponentEntry } from "./types";

/** The namespace a project gives this registry in its components.json. */
export const SHADCN_NAMESPACE = "@motion-garden";

type FileType = "registry:component" | "registry:hook" | "registry:ui";

export interface ShadcnFile {
	path: string;
	type: FileType;
	target: string;
	content?: string;
}

export interface ShadcnItem {
	$schema?: string;
	name: string;
	type: "registry:component";
	title: string;
	description: string;
	dependencies?: string[];
	files: ShadcnFile[];
	cssVars?: {
		theme?: Record<string, string>;
		light?: Record<string, string>;
		dark?: Record<string, string>;
	};
	css?: Record<string, CssRule>;
	docs?: string;
	categories: string[];
	meta?: Record<string, string>;
}

/** The one shipped file a shadcn project already owns: its init writes `cn`. */
const PROJECT_OWNED = "lib/utils.ts";
/** Packages only `lib/utils.ts` needs. Dropped unless a shipped file imports them itself. */
const UTILS_ONLY = ["clsx", "tailwind-merge"];

/**
 * Landing-page templates are whole pages with their own media and token set;
 * they stay out of the shadcn registry.
 */
export function inShadcnRegistry(entry: ComponentEntry): boolean {
	return (entry.kind ?? "component") !== "template";
}

/**
 * Where one shipped file goes in a shadcn project, or null when the project
 * already has it. Throws on a path under a root this mapping does not know, so
 * a new kind of shipped file fails the check instead of landing somewhere odd.
 */
export function shadcnFile(file: string): ShadcnFile | null {
	if (file === PROJECT_OWNED) return null;
	if (file.startsWith("hooks/")) {
		return { path: file, type: "registry:hook", target: `@hooks/${file.slice("hooks/".length)}` };
	}
	if (file.startsWith("components/ui/")) {
		return { path: file, type: "registry:ui", target: `@ui/${file.slice("components/ui/".length)}` };
	}
	if (file.startsWith("components/")) {
		return {
			path: file,
			type: "registry:component",
			target: `@components/${file.slice("components/".length)}`,
		};
	}
	throw new Error(`shadcn registry: no target rule for "${file}"`);
}

const RUNNER: Record<PkgManager, string> = {
	bun: "bunx",
	npm: "npx",
	pnpm: "pnpm dlx",
	yarn: "yarn dlx",
};

/** The one-line install for each package manager, pointing at the entry's item URL. */
export function shadcnAddCommands(
	entry: ComponentEntry,
	absolute: (path: string) => string,
): Record<PkgManager, string> {
	const url = absolute(`/r/${entry.slug}.json`);
	return Object.fromEntries(
		PKG_MANAGERS.map((pm) => [pm, `${RUNNER[pm]} shadcn@latest add ${url}`]),
	) as Record<PkgManager, string>;
}

function categorySlug(category: string): string {
	return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function files(entry: ComponentEntry): ShadcnFile[] {
	return entry.variants.flatMap((variant) => shadcnFile(variant.file) ?? []);
}

/** The entry as the catalog lists it: no file contents, as the shadcn directory requires. */
export function shadcnIndexItem(entry: ComponentEntry): ShadcnItem {
	return {
		name: entry.slug,
		type: "registry:component",
		title: entry.name,
		description: entry.description,
		files: files(entry),
		categories: [categorySlug(entry.category)],
	};
}

/**
 * The installable item. `sources` are the shipped files as the Code tab serves
 * them (comments stripped), `absolute` turns a site path into a full URL.
 */
export function shadcnItem(
	entry: ComponentEntry,
	sources: ReadonlyArray<{ file: string; raw: string }>,
	absolute: (path: string) => string,
): ShadcnItem {
	const shipped = sources.filter((source) => source.file !== PROJECT_OWNED);
	const text = shipped.map((source) => source.raw).join("\n");
	const importsItself = (pkg: string) => new RegExp(`from\\s*["']${pkg}["']`).test(text);
	const hasUtils = sources.some((source) => source.file === PROJECT_OWNED);
	const dependencies = (entry.dependencies ?? []).filter(
		(pkg) => !(hasUtils && UTILS_ONLY.includes(pkg) && !importsItself(pkg)),
	);

	const use = tokensUsed(shipped.map((source) => source.raw));
	const vars = tokenVars(use);
	const filled = (record: Record<string, unknown>) => Object.keys(record).length > 0;
	const cssVars = {
		...(filled(vars.theme) ? { theme: vars.theme } : {}),
		...(filled(vars.light) ? { light: vars.light } : {}),
		...(filled(vars.dark) ? { dark: vars.dark } : {}),
	};

	const page = absolute(`/components/${entry.slug}`);
	const docs = [`Tune ${entry.name} live and copy your values: ${page}`];
	if (use.utilities.includes("accent")) {
		docs.push(
			"Classes such as text-accent follow your project's own --color-accent when it has one. For Motion Garden's amethyst, set it to var(--sg-accent).",
		);
	}
	if (usesDisplayFont(use)) {
		docs.push(
			"font-display expects Space Mono. Load it (with next/font/google, for example); until then it falls back to the system monospace.",
		);
	}

	return {
		$schema: "https://ui.shadcn.com/schema/registry-item.json",
		...shadcnIndexItem(entry),
		...(dependencies.length > 0 ? { dependencies } : {}),
		files: shipped.flatMap((source) => {
			const file = shadcnFile(source.file);
			return file ? [{ ...file, content: source.raw }] : [];
		}),
		...(usesTokens(use) && filled(cssVars) ? { cssVars } : {}),
		...(filled(vars.css) ? { css: vars.css } : {}),
		docs: docs.join("\n\n"),
		meta: { page, brief: `${page}.md` },
	};
}
