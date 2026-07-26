export type StatEvent =
  | "favorited"
  | "unfavorited"
  | "install"
  | "copy"
  | "prompt"
  | "view";

// Fire-and-forget engagement ping to /api/stats. `keepalive` lets the request
// complete even when the same click triggers a navigation (e.g. copy-then-leave).
// Never throws — telemetry must never break a user action. Safe to call from any
// client component; a missing/unconfigured backend just no-ops.
export function trackEvent(slug: string, event: StatEvent): void {
  try {
    void fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let a telemetry hiccup surface to the user.
  }
}
