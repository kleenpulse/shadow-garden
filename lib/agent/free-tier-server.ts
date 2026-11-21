import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentUsage } from "@/lib/db/schema";
import manifest from "@/public/agent/agent-manifest.json";
import network from "@/public/agent/motion_garden.network.json";
import runtimeContext from "./runtime-context.json";
import {
	addressKey,
	agentPrompts,
	freeModel,
	limitHit,
	type LimitHit,
	type UsageRow,
} from "./free-tier";

// The server half of the assistant's free tier (see free-tier.ts for the rules):
// who the visitor is for counting, the daily counters in Postgres, and the
// settings that must never reach the browser.

/**
 * The model every free call runs on. Chosen here, never by the caller, and
 * always a free one: a paid id in AGENT_FREE_MODEL is ignored (freeModel).
 */
export const FREE_MODEL = freeModel(process.env.AGENT_FREE_MODEL);

/**
 * The site's own agents, exactly as the browser runtime sends them: the published
 * network file, the runtime's context (scripts/agent/gen-runtime-context.ts) and
 * the site actions the manifest offers as tools.
 */
export const PROMPTS = agentPrompts(
	network,
	manifest.networks[0].front_man,
	runtimeContext,
	manifest.actions.agentTools,
);

/** The site's OpenRouter key, or null when the free tier is not set up. */
export function freeTierKey(): string | null {
	return process.env.OPENROUTER_API_KEY || null;
}

const SITE_WIDE = "*";
const EMPTY: UsageRow = { questions: 0, calls: 0 };

/** The UTC day the counters run on. */
export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function clientAddress(headers: Headers): string | null {
	// Netlify sets this itself; x-forwarded-for can carry what the client sent.
	return (
		headers.get("x-nf-client-connection-ip") ??
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		headers.get("x-real-ip")
	);
}

/**
 * Who to count this request against: a hash of the day, the address and a
 * server secret. No address is stored, and the hash changes every day.
 */
export function visitorId(headers: Headers, day: string, secret: string): string {
	return createHash("sha256")
		.update(`${day}|${addressKey(clientAddress(headers))}|${secret}`)
		.digest("hex");
}

/** A browser request from this site's own pages: its Origin is the host it reached. */
export function sameOrigin(headers: Headers): boolean {
	const origin = headers.get("origin");
	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!origin || !host) return false;
	const site = headers.get("sec-fetch-site");
	if (site && site !== "same-origin") return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

export interface Usage {
	visitor: UsageRow;
	site: UsageRow;
}

/** Today's counters, or null when the database (or its table) is not there. */
export async function readUsage(visitor: string, day: string): Promise<Usage | null> {
	const db = getDb();
	if (!db) return null;
	try {
		const rows = await db
			.select()
			.from(agentUsage)
			.where(and(eq(agentUsage.day, day), inArray(agentUsage.visitor, [visitor, SITE_WIDE])));
		return {
			visitor: rows.find((row) => row.visitor === visitor) ?? EMPTY,
			site: rows.find((row) => row.visitor === SITE_WIDE) ?? EMPTY,
		};
	} catch {
		return null;
	}
}

/**
 * Count one model call, in one statement so two requests cannot both slip
 * under the limit. A call over the limit is taken back off the counters.
 */
export async function countCall(
	visitor: string,
	day: string,
	question: boolean,
): Promise<"ok" | "unavailable" | LimitHit> {
	const db = getDb();
	if (!db) return "unavailable";
	const questions = question ? 1 : 0;
	try {
		const rows = await db
			.insert(agentUsage)
			.values([
				{ day, visitor, questions, calls: 1 },
				{ day, visitor: SITE_WIDE, questions, calls: 1 },
			])
			.onConflictDoUpdate({
				target: [agentUsage.day, agentUsage.visitor],
				set: {
					questions: sql`${agentUsage.questions} + excluded.questions`,
					calls: sql`${agentUsage.calls} + 1`,
				},
			})
			.returning();
		const mine = rows.find((row) => row.visitor === visitor) ?? EMPTY;
		const site = rows.find((row) => row.visitor === SITE_WIDE) ?? EMPTY;
		// The day's first call: drop counters older than a week.
		if (site.calls === 1) {
			const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
			await db.delete(agentUsage).where(lt(agentUsage.day, cutoff));
		}
		const hit = limitHit(mine, site);
		if (!hit) return "ok";
		await refundCall(visitor, day, question);
		return hit;
	} catch {
		return "unavailable";
	}
}

/** Take a counted call back: it was refused, or the model never answered. */
export async function refundCall(visitor: string, day: string, question: boolean): Promise<void> {
	const db = getDb();
	if (!db) return;
	const questions = question ? 1 : 0;
	try {
		await db
			.update(agentUsage)
			.set({
				questions: sql`greatest(${agentUsage.questions} - ${questions}, 0)`,
				calls: sql`greatest(${agentUsage.calls} - 1, 0)`,
			})
			.where(and(eq(agentUsage.day, day), inArray(agentUsage.visitor, [visitor, SITE_WIDE])));
	} catch {
		// A lost refund costs the visitor one call today. Nothing to do about it here.
	}
}
