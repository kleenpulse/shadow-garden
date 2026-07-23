import { NextResponse } from "next/server";
import { getAllSlugs } from "@/lib/registry";
import { currentUserId } from "@/lib/supabase/current-user";

// Cross-device favorites — the server-backed mirror of the localStorage store.
// The FavoritesSync island (client) drives all three verbs: merge-up on sign-in
// (POST { slugs }), and write-through on toggle (POST { slug } / DELETE { slug }).
// Access is server-side via Drizzle, which bypasses RLS; the `favorites` table
// denies direct PostgREST access. Node runtime by default (no runtime export).
//   GET    /api/favorites            → { slugs }
//   POST   /api/favorites { slug|slugs } → merge, returns full { slugs }
//   DELETE /api/favorites { slug }   → remove, returns full { slugs }

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function listSlugs(userId: string): Promise<string[]> {
  const { db } = await import("@/lib/db");
  const { favorites } = await import("@/lib/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const rows = await db
    .select({ slug: favorites.slug })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return rows.map((r) => r.slug);
}

function extractSlugs(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const b = body as { slug?: unknown; slugs?: unknown };
  if (Array.isArray(b.slugs)) return b.slugs;
  if (b.slug !== undefined) return [b.slug];
  return [];
}

export async function GET() {
  const userId = process.env.DATABASE_URL ? await currentUserId() : null;
  if (!userId) return NextResponse.json({ slugs: [] }, { headers: NO_STORE });
  const slugs = await listSlugs(userId);
  return NextResponse.json({ slugs }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const userId = process.env.DATABASE_URL ? await currentUserId() : null;
  if (!userId) {
    return NextResponse.json(
      { slugs: [], error: "signin_required" },
      { status: 401, headers: NO_STORE },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Empty/invalid body → treated as a no-op merge (still returns current set).
  }

  // Whitelist against the registry so no junk slug can ever land in the table.
  const allowed = new Set(getAllSlugs());
  const incoming = extractSlugs(body).filter(
    (s): s is string => typeof s === "string" && allowed.has(s),
  );

  if (incoming.length > 0) {
    const { db } = await import("@/lib/db");
    const { favorites } = await import("@/lib/db/schema");
    // Idempotent on the (user_id, slug) unique index → repeated merges are safe.
    await db
      .insert(favorites)
      .values(incoming.map((slug) => ({ userId, slug })))
      .onConflictDoNothing();
  }

  const slugs = await listSlugs(userId);
  return NextResponse.json({ slugs }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const userId = process.env.DATABASE_URL ? await currentUserId() : null;
  if (!userId) {
    return NextResponse.json(
      { slugs: [], error: "signin_required" },
      { status: 401, headers: NO_STORE },
    );
  }

  let slug: unknown = null;
  try {
    const body = await request.json();
    slug = (body as { slug?: unknown })?.slug;
  } catch {
    // No slug → no-op delete (still returns current set).
  }

  if (typeof slug === "string") {
    const { db } = await import("@/lib/db");
    const { favorites } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.slug, slug)));
  }

  const slugs = await listSlugs(userId);
  return NextResponse.json({ slugs }, { headers: NO_STORE });
}
