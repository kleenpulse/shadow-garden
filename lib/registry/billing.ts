import "server-only";
import { getPro } from "@/lib/pro";

// A projection of the Pro seam, not a second resolution ladder. This is the richer
// summary the account dropdown renders: plan type, status, next payment. It drops
// `source` because that is an internal detail of how the ladder decided — no client
// needs to know whether a dev cookie or the database answered.

export interface BillingSummary {
  pro: boolean;
  type: "subscription" | "lifetime" | null;
  status: string | null;
  currentPeriodEnd: string | null; // ISO; null == lifetime / none
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean; // has a live subscription to manage/upgrade
}

export async function getBilling(): Promise<BillingSummary> {
  const { source: _source, ...summary } = await getPro();
  return summary;
}
