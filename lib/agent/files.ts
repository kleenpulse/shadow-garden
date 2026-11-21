// Splits one shipped source file into parts an agent can read in a chat. Pure,
// no imports: scripts/agent/check-agent.ts runs it under plain bun.
//
// The browser runtime refuses a tool result over 64 KB of JSON, and every byte is
// paid for by the visitor's model. A part stays well under that even after JSON
// escapes its newlines and quotes.

export const PART_LIMIT = 28_000;

/**
 * Cut `text` into parts of at most `limit` characters, on line boundaries so no
 * part ends mid-statement. A single line longer than the limit (a minified
 * shader string, say) is cut hard. Joining the parts gives back `text` exactly.
 */
export function splitParts(text: string, limit: number = PART_LIMIT): string[] {
	if (text.length <= limit) return [text];
	const parts: string[] = [];
	let current = "";
	for (const line of text.split(/(?<=\n)/)) {
		if (current.length + line.length > limit && current) {
			parts.push(current);
			current = "";
		}
		let rest = line;
		while (rest.length > limit) {
			parts.push(rest.slice(0, limit));
			rest = rest.slice(limit);
		}
		current += rest;
	}
	if (current) parts.push(current);
	return parts;
}
