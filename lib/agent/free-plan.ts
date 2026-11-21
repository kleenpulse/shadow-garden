import "server-only";
import { FREE_TIER, freeModel } from "./free-tier";

/**
 * What every visitor may know about the assistant's free tier before asking:
 * that the site offers it, how many questions a day, and the model's name.
 */
export interface FreePlan {
	perDay: number;
	model: string;
}

/**
 * The free tier as the pages state it, or null when the site has no key for one.
 *
 * It is read from the environment when a page is rendered, so it costs no request
 * of its own. The assistant boots on it in the background; how many questions a
 * visitor has left is asked from the server (app/api/agent/llm) only when they
 * open the chat. That keeps a page view free of function calls.
 */
export function freePlan(): FreePlan | null {
	if (!process.env.OPENROUTER_API_KEY) return null;
	return {
		perDay: FREE_TIER.questionsPerVisitor,
		model: freeModel(process.env.AGENT_FREE_MODEL),
	};
}
