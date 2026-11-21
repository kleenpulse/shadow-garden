import type { NextRequest } from "next/server";
import { registry } from "@/lib/registry";
import { CATEGORY_ORDER, type Category } from "@/lib/registry/types";
import { searchEntries } from "@/lib/agent/search";

// Catalog search for the browser agent (public/agent). Public catalog facts only,
// the same ones the sidebar shows, so any origin may read it: other agentic sites
// call it from Motion Garden's own bridge frame, and tools may call it directly.
export function GET(request: NextRequest): Response {
	const params = request.nextUrl.searchParams;
	const query = (params.get("q") ?? "").slice(0, 200);
	const rawCategory = params.get("category");
	const category = CATEGORY_ORDER.find((c) => c === rawCategory) as Category | undefined;
	if (rawCategory && !category) {
		return Response.json(
			{ ok: false, reason: `Unknown category. Use one of: ${CATEGORY_ORDER.join(", ")}.` },
			{ status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
		);
	}
	const limit = Number(params.get("limit") ?? 6) || 6;
	const results = searchEntries(registry, query, { category, limit });
	return Response.json(
		{ ok: true, query, total: registry.length, results },
		{ headers: { "Access-Control-Allow-Origin": "*" } },
	);
}
