import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/registry/entitlement";

// Client-readable Pro-status seam — getEntitlement() is server-only, so client
// islands (GoProButton) can't call it directly. Reads cookies → dynamic. No
// `export const runtime` (Cache Components forbids the route-segment runtime config).
export async function GET() {
  const { pro } = await getEntitlement();
  return NextResponse.json({ pro }, { headers: { "Cache-Control": "no-store" } });
}
