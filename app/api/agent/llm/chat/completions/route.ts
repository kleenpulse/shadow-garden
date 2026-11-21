import { FREE_TIER, checkFreeRequest } from "@/lib/agent/free-tier";
import {
	FREE_MODEL,
	PROMPTS,
	countCall,
	freeTierKey,
	refundCall,
	sameOrigin,
	today,
	visitorId,
} from "@/lib/agent/free-tier-server";

// The assistant's free tier: an OpenAI-compatible chat endpoint on the site's
// own OpenRouter key, for a visitor who has not connected a model. The browser
// runtime is pointed here as its router (public/agent/site.js) and calls
// <router>/chat/completions like any provider.
//
// The key sits behind a public URL, so every request is narrowed before it is
// paid for (lib/agent/free-tier.ts): this site's own pages only, this site's
// own agents only, the server's model and output cap, and a daily count per
// visitor and site-wide. A visitor who brings a key never comes through here:
// their browser calls their provider directly.
//
// The runtime shows the first 300 characters of an error body after
// "LLM HTTP <status>:", so every refusal is one plain sentence.

const UNAVAILABLE = "The free assistant is not available right now. Open AI model settings below and connect your own AI model.";
const BUSY = "The free assistant could not answer just now. Try again in a moment, or open AI model settings below and connect your own AI model.";
const LIMIT = `You have used today's ${FREE_TIER.questionsPerVisitor} free questions. To keep going, open AI model settings below and connect your own AI model.`;

function plain(status: number, text: string): Response {
	return new Response(text, {
		status,
		headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
	});
}

export async function POST(request: Request): Promise<Response> {
	const key = freeTierKey();
	if (!key) return plain(503, UNAVAILABLE);
	if (!sameOrigin(request.headers)) {
		return plain(403, "The free assistant answers only on the Motion Garden site.");
	}

	const raw = await request.text();
	if (raw.length > FREE_TIER.maxBodyChars) {
		return plain(413, "This chat is too long for the free assistant. Start a new chat.");
	}
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return plain(400, "The request is not a chat request.");
	}
	const checked = checkFreeRequest(body, PROMPTS);
	if (!checked.ok) return plain(checked.status, checked.reason);

	const day = today();
	const visitor = visitorId(request.headers, day, key);
	const counted = await countCall(visitor, day, checked.question);
	if (counted === "unavailable") return plain(503, UNAVAILABLE);
	if (counted === "limit") return plain(429, LIMIT);

	let upstream: Response;
	try {
		upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				model: FREE_MODEL,
				messages: checked.messages,
				...(checked.tools ? { tools: checked.tools, tool_choice: "auto" } : {}),
				stream: true,
				max_tokens: FREE_TIER.maxOutputTokens,
			}),
			signal: request.signal,
		});
	} catch {
		await refundCall(visitor, day, checked.question);
		return plain(502, BUSY);
	}
	if (!upstream.ok || !upstream.body) {
		// The provider's own words can name the account, so they stay on the server.
		await refundCall(visitor, day, checked.question);
		return plain(upstream.status === 429 ? 429 : 502, BUSY);
	}
	return new Response(upstream.body, {
		headers: {
			"Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
			"Cache-Control": "no-store",
		},
	});
}
