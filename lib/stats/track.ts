export type StatEvent =
  | "favorited"
  | "unfavorited"
  | "install"
  | "copy"
  | "prompt"
  | "view";

function post(slug: string, event: StatEvent): Promise<Response> {
  return fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, event }),
    keepalive: true,
  });
}

// Fire-and-forget engagement ping to /api/stats. `keepalive` lets the request
// complete even when the same click triggers a navigation (e.g. copy-then-leave).
// Never throws — telemetry must never break a user action. Safe to call from any
// client component; a missing/unconfigured backend just no-ops.
export function trackEvent(slug: string, event: StatEvent): void {
  try {
    void post(slug, event).catch(() => {});
  } catch {
    // Never let a telemetry hiccup surface to the user.
  }
}

// The components this browser has already sent a view for.
export const VIEWED_KEY = "sg-viewed";

// Views asked for in this tab, so a second effect run (React's dev double
// mount, a quick back-and-forth) cannot send a second request while the first
// is still on its way.
const asked = new Set<string>();

function readViewed(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((slug) => typeof slug === "string") : [];
  } catch {
    return [];
  }
}

function rememberViewed(slug: string): void {
  try {
    const viewed = readViewed();
    if (viewed.includes(slug)) return;
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...viewed, slug]));
  } catch {
    // No storage (private mode, a full quota): this tab's set still holds it.
  }
}

/**
 * One view ping per component per browser. The server counts a view once per
 * visitor and component, for good (the ledger in app/api/stats/route.ts), so a
 * repeat ping can never change a count: it only costs a function call. The
 * browser remembers which components it has reported and stays quiet for those.
 *
 * A component is remembered only after the server has answered, so a ping that
 * never arrived is sent again on the next view.
 */
export function trackView(slug: string): void {
  if (asked.has(slug)) return;
  asked.add(slug);
  if (readViewed().includes(slug)) return;
  try {
    void post(slug, "view")
      .then((response) => {
        if (response.ok) rememberViewed(slug);
        else asked.delete(slug);
      })
      .catch(() => {
        asked.delete(slug);
      });
  } catch {
    asked.delete(slug);
  }
}
