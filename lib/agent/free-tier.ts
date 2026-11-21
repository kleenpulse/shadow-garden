// The assistant's free tier: the rules for a model call the site pays for.
//
// A visitor with no AI model of their own gets a few questions a day on the
// site's own OpenRouter key (app/api/agent/llm). That key sits behind a public
// endpoint, so the endpoint must be worth nothing as a general model proxy:
// the model is chosen on the server, the output is capped, and a request is
// served only when its system prompt is one of this site's own agents'.
//
// Pure, no imports: scripts/agent/check-agent.ts runs it under plain bun. The
// counting and the upstream call live in free-tier-server.ts.

export const FREE_TIER = {
	/** Chat messages a visitor may send per UTC day. */
	questionsPerVisitor: 2,
	/** Chat messages across all visitors per UTC day: the ceiling on the spend. */
	questionsSiteWide: 300,
	/**
	 * Model calls per visitor per day. One question takes several: each tool
	 * round trip is a call, and the helper agent makes its own. This bounds a
	 * caller who never starts a "question" at all.
	 */
	callsPerVisitor: 40,
	callsSiteWide: 4000,
	maxBodyChars: 600_000,
	maxMessages: 80,
	maxTools: 16,
	maxOutputTokens: 4000,
} as const;

/** The model the free tier runs on when none is set, or the one set is not free. */
export const DEFAULT_FREE_MODEL = "openrouter/free";

/**
 * True for a model OpenRouter serves at no charge: its free router, or a model id
 * with the `:free` suffix. The free tier runs nothing else, so the site's key can
 * never be billed through it, whatever the environment says.
 */
export function isFreeModel(model: string): boolean {
	return model === DEFAULT_FREE_MODEL || /^[\w.-]+\/[\w.-]+:free$/.test(model);
}

/** The model to run: the configured one when it is free, otherwise the default. */
export function freeModel(configured: string | undefined): string {
	const wanted = (configured ?? "").trim();
	return isFreeModel(wanted) ? wanted : DEFAULT_FREE_MODEL;
}

/** The key the page hands the runtime. It unlocks nothing: the server ignores it. */
export const FREE_TIER_KEY = "motion-garden-free-tier";

export interface NetworkFile {
	commondefs?: { replacement_strings?: Record<string, string> };
	tools: { name: string; instructions?: string }[];
}

export interface AgentPrompts {
	/** The front agent's resolved instructions, whitespace-normalized. */
	front: string;
	/** Every agent's resolved instructions, whitespace-normalized. */
	all: string[];
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Each agent's instructions as the runtime sends them: `{name}` placeholders
 * filled from the network's replacement strings. The runtime may add context
 * around them, so callers test with `includes`, not equality.
 */
export function agentPrompts(network: NetworkFile, frontAgent: string): AgentPrompts {
	const strings = network.commondefs?.replacement_strings ?? {};
	const resolve = (text: string) => {
		let out = text;
		// A replacement string may hold another placeholder; three passes is plenty.
		for (let pass = 0; pass < 3; pass++) {
			out = out.replace(/\{(\w+)\}/g, (whole, key: string) => strings[key] ?? whole);
		}
		return normalize(out);
	};
	const agents = network.tools.filter((tool) => tool.instructions);
	const front = agents.find((tool) => tool.name === frontAgent) ?? agents[0];
	return {
		front: resolve(front?.instructions ?? ""),
		all: agents.map((tool) => resolve(tool.instructions as string)),
	};
}

type Message = { role?: unknown; content?: unknown; [key: string]: unknown };

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
			.join("\n");
	}
	return "";
}

export type FreeRequest =
	| {
			ok: true;
			messages: Message[];
			tools?: unknown[];
			/** True when this call starts a new visitor question, which the daily limit counts. */
			question: boolean;
	  }
	| { ok: false; status: 400 | 403 | 413; reason: string };

/**
 * Decide whether a chat-completions body may run on the site's key, and keep
 * only the fields the upstream call needs. The caller's `model`, `max_tokens`
 * and every other option are dropped: the server sets those.
 */
export function checkFreeRequest(body: unknown, prompts: AgentPrompts): FreeRequest {
	if (!body || typeof body !== "object") return { ok: false, status: 400, reason: "The request is not a chat request." };
	const { messages, tools } = body as { messages?: unknown; tools?: unknown };
	if (!Array.isArray(messages) || messages.length < 2) {
		return { ok: false, status: 400, reason: "The request is not a chat request." };
	}
	if (messages.length > FREE_TIER.maxMessages) {
		return { ok: false, status: 413, reason: "This chat is too long for the free assistant. Start a new chat." };
	}
	if (tools !== undefined && (!Array.isArray(tools) || tools.length > FREE_TIER.maxTools)) {
		return { ok: false, status: 400, reason: "The request is not a chat request." };
	}
	for (const message of messages) {
		const role = (message as Message | null)?.role;
		if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
			return { ok: false, status: 400, reason: "The request is not a chat request." };
		}
	}
	const list = messages as Message[];
	const system = list[0].role === "system" ? normalize(textOf(list[0].content)) : "";
	const agent = prompts.all.find((prompt) => prompt.length > 0 && system.includes(prompt));
	if (!agent || list.slice(1).some((message) => message.role === "system")) {
		return { ok: false, status: 403, reason: "The free assistant only answers for the Motion Garden assistant." };
	}
	return {
		ok: true,
		messages: list,
		...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
		// The front agent, with the visitor's message last: a new question. A tool
		// round trip ends in a tool message, and the helper agent is not the front.
		question: agent === prompts.front && list[list.length - 1].role === "user",
	};
}

export interface UsageRow {
	questions: number;
	calls: number;
}

/** After counting a call: is it within the day's limits? */
export function withinLimits(visitor: UsageRow, site: UsageRow): boolean {
	return (
		visitor.questions <= FREE_TIER.questionsPerVisitor &&
		visitor.calls <= FREE_TIER.callsPerVisitor &&
		site.questions <= FREE_TIER.questionsSiteWide &&
		site.calls <= FREE_TIER.callsSiteWide
	);
}

/** Questions a visitor can still ask today, given what is already counted. */
export function questionsLeft(visitor: UsageRow, site: UsageRow): number {
	const mine = FREE_TIER.questionsPerVisitor - visitor.questions;
	const shared = FREE_TIER.questionsSiteWide - site.questions;
	if (visitor.calls >= FREE_TIER.callsPerVisitor || site.calls >= FREE_TIER.callsSiteWide) return 0;
	return Math.max(0, Math.min(mine, shared));
}

/**
 * The address to count a visitor by. IPv4 as given; IPv6 cut to its /64, since
 * one visitor usually holds a whole /64 and can pick any address in it.
 */
export function addressKey(ip: string | null | undefined): string {
	const value = (ip ?? "").trim().toLowerCase();
	if (!value) return "unknown";
	if (!value.includes(":")) return value;
	const [head, tail = ""] = value.split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const missing = Math.max(0, 8 - left.length - right.length);
	const groups = [...left, ...Array.from({ length: value.includes("::") ? missing : 0 }, () => "0"), ...right];
	return groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":");
}
