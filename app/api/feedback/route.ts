import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUserClaims } from "@/lib/supabase/current-user";

// User feedback / bug reports from the sidebar widget. Anonymous by design — the
// sidebar renders for logged-out visitors too — so auth is optional: we attribute
// to the signed-in user when present, else to the per-browser `sg_vid` cookie.
// Access is server-side via Drizzle (bypasses RLS); the `feedback` table denies
// direct PostgREST access. Node runtime by default (no runtime export).
//   POST /api/feedback { type, subject?, message, email?, page?, context?, company? } → { ok }

const NO_STORE = { "Cache-Control": "no-store" } as const;

type FeedbackType = "bug" | "idea" | "other";
const TYPES = new Set<string>(["bug", "idea", "other"]);
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 700;
const SUBJECT_MAX = 120;
const EMAIL_MAX = 254;
const CONTEXT_MAX_BYTES = 8192;
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const THROTTLE_MAX = 5; // submissions per identity per window

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

// Coarse geo from platform edge headers (Vercel). Absent in local dev → null.
function serverGeo(req: Request) {
  const country = req.headers.get("x-vercel-ip-country");
  const city = req.headers.get("x-vercel-ip-city");
  const region = req.headers.get("x-vercel-ip-country-region");
  const timezone = req.headers.get("x-vercel-ip-timezone");
  if (!country && !city && !region && !timezone) return null;
  return {
    country: country ?? null,
    city: city ? decodeURIComponent(city) : null,
    region: region ?? null,
    timezone: timezone ?? null,
  };
}

export async function POST(req: Request) {
  // Dev without a DB configured → accept but don't persist, so the form still
  // "works" offline (mirrors the seed short-circuit on the admin side).
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: true, simulated: true },
      { headers: NO_STORE },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: NO_STORE },
    );
  }

  // Honeypot: real users never fill this hidden field. Silently accept (200) so a
  // bot never learns it was caught — but write nothing.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  // Validate + normalize. The server is the source of truth — the client `status`
  // (if any) is ignored; everything lands as `new`.
  const type: FeedbackType =
    typeof body.type === "string" && TYPES.has(body.type)
      ? (body.type as FeedbackType)
      : "bug";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return NextResponse.json(
      { error: "invalid_message" },
      { status: 400, headers: NO_STORE },
    );
  }
  const subjectRaw = typeof body.subject === "string" ? body.subject.trim() : "";
  const subject = subjectRaw ? subjectRaw.slice(0, SUBJECT_MAX) : null;
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email =
    emailRaw &&
    emailRaw.length <= EMAIL_MAX &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)
      ? emailRaw
      : null;
  const page = typeof body.page === "string" ? body.page.slice(0, 512) : null;

  // Best-effort client context, capped so a hostile payload can't bloat the row.
  let clientContext: Record<string, unknown> = {};
  if (body.context && typeof body.context === "object") {
    const c = body.context as Record<string, unknown>;
    try {
      if (JSON.stringify(c).length <= CONTEXT_MAX_BYTES) clientContext = c;
    } catch {
      // Non-serializable → drop it.
    }
  }

  // Identity: signed-in user (nullable) + a stable per-browser visitor id.
  const claims = await getCurrentUserClaims();
  const userId = claims?.sub ?? null;

  const jar = await cookies();
  let visitorId = jar.get("sg_vid")?.value ?? null;
  let setCookie = false;
  if (!visitorId) {
    visitorId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    setCookie = true;
  }

  const ip = clientIp(req);
  const geo = serverGeo(req);

  const { getDb } = await import("@/lib/db");
  const { feedback } = await import("@/lib/db/schema");
  const { and, or, eq, gte, sql } = await import("drizzle-orm");

  // Unreachable in practice — the DATABASE_URL short-circuit above already
  // returned. Kept so the handle stays non-null for the checker, not asserted.
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { ok: true, simulated: true },
      { headers: NO_STORE },
    );
  }

  // Per-identity throttle. visitorId always exists (we mint one above); userId is
  // an extra key when signed in so a user can't dodge the cap by clearing cookies.
  const since = new Date(Date.now() - THROTTLE_WINDOW_MS);
  const idMatch = userId
    ? or(eq(feedback.visitorId, visitorId), eq(feedback.userId, userId))
    : eq(feedback.visitorId, visitorId);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(gte(feedback.createdAt, since), idMatch));
  if (n >= THROTTLE_MAX) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: NO_STORE },
    );
  }

  await db.insert(feedback).values({
    userId,
    visitorId,
    email,
    type,
    subject,
    message,
    page,
    context: { ...clientContext, ip, geo, receivedAt: new Date().toISOString() },
  });

  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  if (setCookie && visitorId) {
    res.cookies.set("sg_vid", visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // one year
    });
  }
  return res;
}
