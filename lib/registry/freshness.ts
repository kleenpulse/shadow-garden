export const NEW_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * True when `addedAt` (an ISO date like "2026-07-24") falls within the last
 * NEW_WINDOW_DAYS relative to `now` (ms epoch). Pure — the caller supplies the
 * clock, which keeps wall-clock reads out of any static/prerender path.
 */
export function isWithinNewWindow(
  addedAt: string | undefined,
  now: number,
): boolean {
  if (!addedAt) return false;
  const t = Date.parse(addedAt);
  return !Number.isNaN(t) && now - t < NEW_WINDOW_DAYS * DAY_MS;
}
