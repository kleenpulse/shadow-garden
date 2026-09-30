/*
 * Shared timing. Anything that must land together — a beam's tip and the orb it
 * lights, a spark and the card it reveals — reads its delay from here, so one
 * constant can't drift from the other.
 */

export const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Share of a draw after which EASE has covered ~95% of the path (solved from the bezier). */
export const ARRIVE = 0.45;

export function arriveAt(delay: number, dur: number): number {
	return Math.round(delay + dur * ARRIVE);
}

/* ─── ignition: beams draw out from the sun, each group lights as its tip lands ─── */

export const BEAM_MS = 700;
export const BLOOM_MS = 700;

export const beamStart = (i: number) => 220 + i * 60;
export const beamArrive = (i: number) => arriveAt(beamStart(i), BEAM_MS);
/** The k-th node of a group, once the group's beam has landed. Capped so a crowded group can't outlast the entrance. */
export const senderStart = (catArrive: number, k: number) => catArrive + 120 + Math.min(k, 7) * 40;

/** Latest bloom end across up to 7 groups — the ignition must not settle before it. */
export const IGNITION_MS = Math.max(2000, senderStart(beamArrive(6), 7) + BLOOM_MS);

/** Deterministic PRNG (mulberry32-style) for stage-seeded decoration. */
export function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
