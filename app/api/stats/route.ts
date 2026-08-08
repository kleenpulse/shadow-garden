import { NextResponse } from "next/server";
import { has } from "@/lib/capabilities";
import { cookies } from "next/headers";
import { getAllSlugs } from "@/lib/registry";

// Per-component engagement counter. Fire-and-forget from the client (favorite,
// install, copy-source, view). Anonymous by design — no auth — so every visitor's
// events count. install/copy/prompt are soft, inflatable intent signals (no CLI
// verification to back an "install"); acceptable social proof for an indie
// showcase. Views and favorites are exact: both ride a per-visitor dedup ledger
// keyed by the `sg_vid` cookie. Best-effort: a DB hiccup never surfaces to the
// user. Node runtime by default (no runtime export under Cache Components).
//   POST /api/stats  { slug, event } → 204

const EVENTS = new Set([
  "favorited",
  "unfavorited",
  "install",
  "copy",
  "prompt",
  "view",
]);
type StatEvent =
  | "favorited"
  | "unfavorited"
  | "install"
  | "copy"
  | "prompt"
  | "view";

// Explicit per-event upsert. Literal column keys keep this fully type-safe (a
// computed key would widen to a string index and break Drizzle's set type).
// Rows are created lazily on first event; `unfavorited` floors the count at 0.
async function increment(slug: string, event: StatEvent) {
  const { getDb } = await import("@/lib/db");
  const { componentStats } = await import("@/lib/db/schema");
  const { sql } = await import("drizzle-orm");
  const db = getDb();
  if (!db) return;
  const now = new Date();
  const target = componentStats.slug;

  switch (event) {
    case "favorited":
      return db
        .insert(componentStats)
        .values({ slug, favoriteCount: 1 })
        .onConflictDoUpdate({
          target,
          set: {
            favoriteCount: sql`${componentStats.favoriteCount} + 1`,
            updatedAt: now,
          },
        });
    case "unfavorited":
      return db
        .insert(componentStats)
        .values({ slug, favoriteCount: 0 })
        .onConflictDoUpdate({
          target,
          set: {
            favoriteCount: sql`GREATEST(${componentStats.favoriteCount} - 1, 0)`,
            updatedAt: now,
          },
        });
    case "install":
      return db
        .insert(componentStats)
        .values({ slug, installCount: 1 })
        .onConflictDoUpdate({
          target,
          set: {
            installCount: sql`${componentStats.installCount} + 1`,
            updatedAt: now,
          },
        });
    case "copy":
      return db
        .insert(componentStats)
        .values({ slug, copyCount: 1 })
        .onConflictDoUpdate({
          target,
          set: {
            copyCount: sql`${componentStats.copyCount} + 1`,
            updatedAt: now,
          },
        });
    // Kept distinct from `copy`: one is "I took the source", the other is
    // "I asked an LLM to wire it in". Folding them would make both unreadable.
    case "prompt":
      return db
        .insert(componentStats)
        .values({ slug, promptCount: 1 })
        .onConflictDoUpdate({
          target,
          set: {
            promptCount: sql`${componentStats.promptCount} + 1`,
            updatedAt: now,
          },
        });
    case "view":
      return db
        .insert(componentStats)
        .values({ slug, viewCount: 1 })
        .onConflictDoUpdate({
          target,
          set: {
            viewCount: sql`${componentStats.viewCount} + 1`,
            updatedAt: now,
          },
        });
  }
}

// Stable per-browser identity for the dedup ledgers (views, favorites). Reads
// the `sg_vid` cookie, minting one onto the response when absent.
async function resolveVisitor(res: NextResponse): Promise<string> {
  const jar = await cookies();
  let visitorId = jar.get("sg_vid")?.value ?? null;
  if (!visitorId) {
    visitorId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    res.cookies.set("sg_vid", visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // one year
    });
  }
  return visitorId;
}

// Unique-view path: record the (visitor, slug) pair in the dedup ledger and only
// bump the public view_count when it is brand new. Any failure degrades to
// "no count" — never surfaces to the user.
async function handleView(slug: string): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  const visitorId = await resolveVisitor(res);

  try {
    const { getDb } = await import("@/lib/db");
    const { componentViews } = await import("@/lib/db/schema");
    const db = getDb();
    // Insert the (slug, visitor) pair; a conflict means this viewer already counted.
    const inserted = db
      ? await db
          .insert(componentViews)
          .values({ slug, visitorId })
          .onConflictDoNothing()
          .returning({ slug: componentViews.slug })
      : [];
    if (inserted.length > 0) await increment(slug, "view");
  } catch (err) {
    console.error("[stats] view dedup failed:", err);
  }

  return res;
}

// Favorite path: the per-visitor ledger is the source of truth for the public
// count. `favorited` inserts the (slug, visitor) pair and bumps the count only
// when the pair is new; `unfavorited` deletes it and decrements only when it
// existed — so replays and toggle-spam leave the count exact.
async function handleFavorite(slug: string, on: boolean): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  const visitorId = await resolveVisitor(res);

  try {
    const { getDb } = await import("@/lib/db");
    const { favorites } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const db = getDb();
    if (!db) return res;

    if (on) {
      const inserted = await db
        .insert(favorites)
        .values({ slug, visitorId })
        .onConflictDoNothing()
        .returning({ slug: favorites.slug });
      if (inserted.length > 0) await increment(slug, "favorited");
    } else {
      const deleted = await db
        .delete(favorites)
        .where(and(eq(favorites.slug, slug), eq(favorites.visitorId, visitorId)))
        .returning({ slug: favorites.slug });
      if (deleted.length > 0) await increment(slug, "unfavorited");
    }
  } catch (err) {
    console.error("[stats] favorite ledger failed:", err);
  }

  return res;
}

export async function POST(request: Request) {
  if (!has("db")) return new NextResponse(null, { status: 204 });

  let slug: unknown;
  let event: unknown;
  try {
    const body = await request.json();
    slug = (body as { slug?: unknown })?.slug;
    event = (body as { event?: unknown })?.event;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  // Whitelist both inputs: the event must be known and the slug a real registry
  // component — this is the only guard against junk rows / counter spam.
  if (
    typeof slug !== "string" ||
    typeof event !== "string" ||
    !EVENTS.has(event) ||
    !getAllSlugs().includes(slug)
  ) {
    return new NextResponse(null, { status: 204 });
  }

  // Views and favorites ride the per-visitor ledgers; every other event is a
  // raw, intentional gesture.
  if (event === "view") return handleView(slug);
  if (event === "favorited") return handleFavorite(slug, true);
  if (event === "unfavorited") return handleFavorite(slug, false);

  try {
    await increment(slug, event as StatEvent);
  } catch (err) {
    console.error("[stats] increment failed:", err);
  }

  return new NextResponse(null, { status: 204 });
}
