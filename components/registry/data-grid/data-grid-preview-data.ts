// Preview fixtures. Never shipped — the grid takes `rows` and `columns` from the
// caller, so nothing about this file is part of what a customer pastes.
//
// Deterministic on purpose: a seeded generator means the same row is at the same
// index on every render and across reloads, so the sort and selection controls
// can be judged against a stable list instead of a new one each time.

export interface Deploy {
  id: string;
  service: string;
  env: string;
  status: string;
  duration: number;
  size: number;
  author: string;
  commit: string;
}

const SERVICES = [
  "gateway", "auth-edge", "billing", "search-index", "media-worker",
  "notifier", "webhooks", "analytics", "scheduler", "asset-cdn",
];
const ENVS = ["production", "staging", "preview"];
const STATUSES = ["succeeded", "succeeded", "succeeded", "failed", "queued", "building"];
const AUTHORS = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta",
];
const HEX = "0123456789abcdef";

/** Small LCG — the point is repeatability, not statistical quality. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function buildRows(count: number): Deploy[] {
  const random = seeded(0x5eed);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]!;

  return Array.from({ length: count }, (_, index) => ({
    id: `dpl_${String(count - index).padStart(5, "0")}`,
    service: pick(SERVICES),
    env: pick(ENVS),
    status: pick(STATUSES),
    duration: Math.round(random() * 2400) / 10,
    size: Math.round(random() * 9000) + 400,
    author: pick(AUTHORS),
    commit: Array.from({ length: 7 }, () => HEX[Math.floor(random() * 16)]).join(""),
  }));
}
