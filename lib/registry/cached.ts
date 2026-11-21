import "server-only";
import { cacheLife } from "next/cache";
import { IS_LOCAL_DEV } from "../env";
import { getEntry } from "./index";
import { getPrompt, type PromptResult } from "./prompt";
import { getSource, type SourceResult } from "./source";

// The component page's two disk reads: the Code tab's source and the "Copy for
// Agent" brief. Under Cache Components a server component that reads a file
// outside a "use cache" function is left as a hole that a function fills on
// every request, even inside <Suspense>, and one such hole makes the whole page
// answer `private, no-store`. With the reads here, all the component pages are
// built once at deploy time and served as files.
//
// Each function takes a slug, not an entry: arguments and results of a cached
// function must be plain data.
//
// Not in dev: there the cache outlives an edit to a component file, and the
// Code tab would keep showing the old source until the server restarts. Dev
// reads the disk every time, as it did before these were cached.

// The sources cannot change inside one deploy, so an entry is never rebuilt by
// time. Not `cacheLife("max")`: its 30 day revalidate gives the page a finite
// lifetime, and Netlify's runtime then treats the page's prefetch data as stale
// and will not store it, so every prefetch of a component page ran a function
// (measured: lifetime of minus 30 days, `fwd=bypass`). Pages that never
// revalidate, like every other page here, have their prefetch data stored.
const UNTIL_NEXT_DEPLOY = { revalidate: Infinity, expire: Infinity } as const;

async function readSource(slug: string): Promise<SourceResult> {
	const entry = getEntry(slug);
	return entry ? getSource(entry) : { status: "pending" };
}

async function readPrompt(slug: string): Promise<PromptResult> {
	const entry = getEntry(slug);
	return entry ? getPrompt(entry) : { status: "pending" };
}

async function storedSource(slug: string): Promise<SourceResult> {
	"use cache";
	cacheLife(UNTIL_NEXT_DEPLOY);
	return readSource(slug);
}

async function storedPrompt(slug: string): Promise<PromptResult> {
	"use cache";
	cacheLife(UNTIL_NEXT_DEPLOY);
	return readPrompt(slug);
}

/** The shipped source of one component, highlighted, with comments stripped. */
export const cachedSource = IS_LOCAL_DEV ? readSource : storedSource;

/** The "Copy for Agent" brief of one component. */
export const cachedPrompt = IS_LOCAL_DEV ? readPrompt : storedPrompt;
