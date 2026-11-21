import { FREE_TIER, questionsLeft } from "@/lib/agent/free-tier";
import {
	FREE_MODEL,
	freeTierKey,
	readUsage,
	today,
	visitorId,
} from "@/lib/agent/free-tier-server";

// Whether the assistant's free tier is on, and how many questions this visitor
// has left today. public/agent/site.js asks before it boots: with questions
// left it points the runtime at ./chat/completions, otherwise the visitor gets
// the usual "connect your own model" setup. A deploy without OPENROUTER_API_KEY
// or without the agent_usage table (a fork, a local checkout) answers
// available false, and the assistant works as it did before the free tier.

function answer(body: unknown): Response {
	return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
	const key = freeTierKey();
	if (!key) return answer({ available: false });
	const day = today();
	const usage = await readUsage(visitorId(request.headers, day, key), day);
	if (!usage) return answer({ available: false });
	return answer({
		available: true,
		perDay: FREE_TIER.questionsPerVisitor,
		left: questionsLeft(usage.visitor, usage.site),
		model: FREE_MODEL,
	});
}
