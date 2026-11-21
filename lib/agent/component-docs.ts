import { cacheLife } from "next/cache";
import { UNTIL_NEXT_DEPLOY } from "@/lib/cache-life";
import { IS_LOCAL_DEV } from "@/lib/env";
import { getEntry } from "@/lib/registry";
import { getPrompt } from "@/lib/registry/prompt";
import { inShadcnRegistry, shadcnItem } from "@/lib/registry/shadcn";
import { getSource } from "@/lib/registry/source";
import { absoluteUrl } from "@/lib/site";
import { describeEntry } from "./describe";
import { splitParts } from "./files";

// The documents the agent endpoints serve beside "describe": a component's
// integration brief, its source, and its shadcn registry item. Each is one whole
// document per component, with nothing chosen by the caller, so every one is
// built once at deploy time and served as a static file
// (app/api/agent/component/[slug]/*, app/r/[name]). What a caller wants out of a
// document, a brief under a size or one part of one file, is picked on the
// caller's side (public/agent/garden-data.js).
//
// They read the component files from disk. Under Cache Components a route that
// does that is only built ahead of time when the read sits in a "use cache"
// function; without it Next runs the route on every request (it showed as ƒ in
// `next build`). The sources cannot change inside one deploy, so the entries
// are never rebuilt by time (lib/cache-life.ts).
//
// Each function takes a slug and answers null when the catalog has no such
// entry or its files cannot be read: arguments and results of a cached function
// must be plain data.
//
// Dev skips the cache (see the exports at the end): there it outlives an edit to
// a component file and would keep serving the old source.

/**
 * The "Copy for Agent" brief with what an answer about the code needs around
 * it: the install commands, the Markdown link and each file's size.
 */
async function buildBrief(slug: string) {
	const entry = getEntry(slug);
	if (!entry) return null;
	const [prompt, source] = await Promise.all([getPrompt(entry), getSource(entry)]);
	if (prompt.status !== "ok" || source.status !== "ok") return null;
	const described = describeEntry(entry, absoluteUrl);
	return {
		ok: true as const,
		slug: entry.slug,
		name: entry.name,
		page: described.page,
		markdown: described.markdown,
		install: described.install,
		// The one-line shadcn install, so an answer about the code can lead with it.
		...(described.shadcn ? { shadcn: described.shadcn } : {}),
		files: source.files.map((file) => ({
			file: file.file,
			role: file.role,
			chars: file.raw.length,
			parts: splitParts(file.raw).length,
		})),
		chars: prompt.text.length,
		brief: prompt.text,
	};
}

/**
 * Every shipped file, comments stripped, already cut into the parts a chat tool
 * result can carry (lib/agent/files.ts).
 */
async function buildSource(slug: string) {
	const entry = getEntry(slug);
	if (!entry) return null;
	const source = await getSource(entry);
	if (source.status !== "ok") return null;
	return {
		ok: true as const,
		slug: entry.slug,
		name: entry.name,
		page: absoluteUrl(`/components/${entry.slug}`),
		files: source.files.map((file) => ({
			file: file.file,
			role: file.role,
			lang: file.lang,
			chars: file.raw.length,
			parts: splitParts(file.raw),
		})),
	};
}

/** One component as a shadcn registry item (lib/registry/shadcn.ts). */
async function buildShadcn(slug: string) {
	const entry = getEntry(slug);
	if (!entry || !inShadcnRegistry(entry)) return null;
	const source = await getSource(entry);
	if (source.status !== "ok") return null;
	return shadcnItem(entry, source.files, absoluteUrl);
}

async function storedBrief(slug: string) {
	"use cache";
	cacheLife(UNTIL_NEXT_DEPLOY);
	return buildBrief(slug);
}

async function storedSource(slug: string) {
	"use cache";
	cacheLife(UNTIL_NEXT_DEPLOY);
	return buildSource(slug);
}

async function storedShadcn(slug: string) {
	"use cache";
	cacheLife(UNTIL_NEXT_DEPLOY);
	return buildShadcn(slug);
}

export const briefDoc = IS_LOCAL_DEV ? buildBrief : storedBrief;
export const sourceDoc = IS_LOCAL_DEV ? buildSource : storedSource;
export const shadcnDoc = IS_LOCAL_DEV ? buildShadcn : storedShadcn;
