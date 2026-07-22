import { NextResponse } from "next/server";
import { getBilling } from "@/lib/registry/billing";

// Client-readable billing summary for the account dropdown (plan, status, next
// payment). Reads cookies → dynamic. No `export const runtime` (Cache Components).
export async function GET() {
  const billing = await getBilling();
  return NextResponse.json(billing, {
    headers: { "Cache-Control": "no-store" },
  });
}
