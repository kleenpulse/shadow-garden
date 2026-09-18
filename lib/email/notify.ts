import "server-only";
import { sendEmail, type Built } from "@/lib/email/send";

// User-directed dispatch, one layer above the raw sendEmail seam. Two entry points:
//   sendUserEmail — you already hold the recipient (guard + send + swallow).
//   notifyUser    — you only have a userId (resolve the profile, then dispatch).
// Both are fire-and-forget: a mail failure must never break the caller's flow
// (sign-in, a paid entitlement write). This is the one place a send is swallowed.

type Recipient = { email: string | null; name: string | null };

export async function sendUserEmail(r: Recipient, built: Built): Promise<void> {
  if (!r.email) return;
  try {
    await sendEmail({ to: r.email, ...built });
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

export async function notifyUser(
  userId: string,
  build: (r: { name: string | null }) => Built,
): Promise<void> {
  const r = await lookupRecipient(userId);
  if (r) await sendUserEmail(r, build({ name: r.name }));
}

async function lookupRecipient(userId: string): Promise<Recipient | null> {
  const { getDb } = await import("@/lib/db");
  const { profiles } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  // No DB → no recipient to resolve. notifyUser already treats null as "skip",
  // which keeps dispatch fire-and-forget instead of throwing into the caller.
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ email: profiles.email, name: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row ?? null;
}
