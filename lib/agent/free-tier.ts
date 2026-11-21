// The assistant's free tier: the rules for a model call the site pays for.
//
// A visitor with no AI model of their own gets a few questions a day on the
// site's own OpenRouter key (app/api/agent/llm). That key sits behind a public
// endpoint, so a request is served only when it is what this site's own
// assistant sends: one of its agents' exact system messages, only its own
// tools, the server's choice of a free model, a capped output, and a model
// call only as part of a question that was counted.
//
// What this does not stop: a caller can still type anything in the user
// message, as a visitor can in the chat. The system message bounds what the
// model is told to be; the limits bound how much anyone gets. Free models only
// means the key is never billed.
//
// Pure, no imports: scripts/agent/check-agent.ts runs it under plain bun. The
// counting and the upstream call live in free-tier-server.ts.

export const FREE_TIER = {
	/** Chat messages a visitor may send per UTC day. */
	questionsPerVisitor: 2,
	/** Chat messages across all visitors per UTC day. */
	questionsSiteWide: 300,
	/**
	 * Model calls one question may take. Each tool round trip is a call, and the
	 * helper agent makes its own; a normal question takes 3 to 8. A visitor's
	 * calls for the day may never pass their counted questions times this, so no
	 * call runs before a question is spent.
	 */
	callsPerQuestion: 16,
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

/** What the runtime appends to an agent's instructions (lib/agent/runtime-context.json). */
export interface RuntimeContext {
	/** For the front agent, whose audience is the visitor. */
	user: string;
	/** For an agent that a parent agent calls. */
	parent: string;
}

export interface AgentPrompts {
	/** The front agent's whole system message, whitespace-normalized. */
	front: string;
	/** Every agent's whole system message, whitespace-normalized. */
	all: string[];
	/** The only tool names a request may carry. */
	tools: string[];
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Each agent's system message exactly as the runtime sends it on this site's
 * own pages: the network's instructions with their `{name}` placeholders
 * filled, then the runtime's context for that agent's audience. Also the tool
 * names the runtime offers: the network's own agents, the site's website_*
 * actions and the runtime's render_cruse.
 */
export function agentPrompts(
	network: NetworkFile,
	frontAgent: string,
	context: RuntimeContext,
	siteActions: readonly string[],
): AgentPrompts {
	const strings = network.commondefs?.replacement_strings ?? {};
	const resolve = (text: string) => {
		let out = text;
		// A replacement string may hold another placeholder; three passes is plenty.
		for (let pass = 0; pass < 3; pass++) {
			out = out.replace(/\{(\w+)\}/g, (whole, key: string) => strings[key] ?? whole);
		}
		return out;
	};
	const agents = network.tools.filter((tool) => tool.instructions);
	const front = agents.find((tool) => tool.name === frontAgent) ?? agents[0];
	const message = (agent: (typeof agents)[number]) =>
		normalize(`${resolve(agent.instructions as string)} ${agent === front ? context.user : context.parent}`);
	return {
		front: front ? message(front) : "",
		all: agents.map(message),
		tools: [...agents.map((agent) => agent.name), ...siteActions.map((name) => `website_${name}`), "render_cruse"],
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

function toolName(tool: unknown): string | null {
	if (!tool || typeof tool !== "object") return null;
	const { type, function: fn } = tool as { type?: unknown; function?: { name?: unknown } };
	return type === "function" && fn && typeof fn.name === "string" ? fn.name : null;
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

const NOT_A_CHAT = { ok: false, status: 400, reason: "The request is not a chat request." } as const;
const NOT_OURS = { ok: false, status: 403, reason: "The free assistant only answers for the Motion Garden assistant." } as const;

/**
 * Decide whether a chat-completions body may run on the site's key, and keep
 * only the fields the upstream call needs. The caller's `model`, `max_tokens`
 * and every other option are dropped: the server sets those.
 */
export function checkFreeRequest(body: unknown, prompts: AgentPrompts): FreeRequest {
	if (!body || typeof body !== "object") return NOT_A_CHAT;
	const { messages, tools } = body as { messages?: unknown; tools?: unknown };
	if (!Array.isArray(messages) || messages.length < 2) return NOT_A_CHAT;
	if (messages.length > FREE_TIER.maxMessages) {
		return { ok: false, status: 413, reason: "This chat is too long for the free assistant. Start a new chat." };
	}
	if (tools !== undefined && (!Array.isArray(tools) || tools.length > FREE_TIER.maxTools)) return NOT_A_CHAT;
	for (const message of messages) {
		const role = (message as Message | null)?.role;
		if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") return NOT_A_CHAT;
	}
	const list = messages as Message[];
	// The runtime asks for a completion after the visitor's message or after a
	// tool result, never after the model's own turn.
	const last = list[list.length - 1].role;
	if (last !== "user" && last !== "tool") return NOT_A_CHAT;

	// The system message must be one of this site's agents, whole and alone: text
	// added before or after it, or a second system message, is someone else's prompt.
	const system = list[0].role === "system" ? normalize(textOf(list[0].content)) : "";
	const agent = prompts.all.find((prompt) => prompt.length > 0 && system === prompt);
	if (!agent || list.slice(1).some((message) => message.role === "system")) return NOT_OURS;
	for (const tool of Array.isArray(tools) ? tools : []) {
		const name = toolName(tool);
		if (!name || !prompts.tools.includes(name)) return NOT_OURS;
	}
	return {
		ok: true,
		messages: list,
		...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
		// The front agent, with the visitor's message last: a new question. A tool
		// round trip ends in a tool message, and the helper agent is not the front.
		// Those run only against a question already counted (withinLimits).
		question: agent === prompts.front && last === "user",
	};
}

export interface UsageRow {
	questions: number;
	calls: number;
}

/** Which limit a counted call broke: the visitor's questions, the site-wide cap, or one question's steps. */
export type LimitHit = "visitor" | "site" | "steps";

/**
 * After counting a call: the limit it broke, or null when it may run. A
 * visitor's calls are bounded by the questions they have been counted for, so
 * a call that is not a question cannot run before one, and cannot outrun the
 * questions spent.
 */
export function limitHit(visitor: UsageRow, site: UsageRow): LimitHit | null {
	if (visitor.questions > FREE_TIER.questionsPerVisitor) return "visitor";
	if (site.questions > FREE_TIER.questionsSiteWide || site.calls > FREE_TIER.callsSiteWide) return "site";
	if (visitor.calls > visitor.questions * FREE_TIER.callsPerQuestion) return "steps";
	return null;
}

export function withinLimits(visitor: UsageRow, site: UsageRow): boolean {
	return limitHit(visitor, site) === null;
}

/** Questions a visitor can still ask today, given what is already counted. */
export function questionsLeft(visitor: UsageRow, site: UsageRow): number {
	if (site.calls >= FREE_TIER.callsSiteWide) return 0;
	const mine = FREE_TIER.questionsPerVisitor - visitor.questions;
	const shared = FREE_TIER.questionsSiteWide - site.questions;
	return Math.max(0, Math.min(mine, shared));
}

/**
 * The address to count a visitor by. IPv4 as given, also when a host reports
 * it as IPv4-mapped IPv6 (`::ffff:203.0.113.7`); IPv6 cut to its /64, since
 * one visitor usually holds a whole /64 and can pick any address in it.
 */
export function addressKey(ip: string | null | undefined): string {
	const value = (ip ?? "").trim().toLowerCase();
	if (!value) return "unknown";
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
	if (mapped) return mapped[1];
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
