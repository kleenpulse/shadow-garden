// Lightweight subsequence fuzzy scorer for the sidebar filter. Returns 0 for no
// match; higher is better. Rewards contiguous runs and start-of-word hits — the
// same ranking spirit as the command palette, without coupling to cmdk internals.

export interface FuzzyMatch {
  score: number;
  /** Indices into `text` that the query consumed, ascending. Empty query → []. */
  indices: number[];
}

/**
 * The scorer, plus the positions it matched at.
 *
 * `fuzzyScore` used to be the whole story and threw the positions away, which is
 * why nothing in the app could ever highlight *why* a row matched. Same loop,
 * same bonuses — the indices were always there, they just weren't collected.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 1, indices: [] };
  const t = text.toLowerCase();

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const char = q[qi];
    const found = t.indexOf(char, ti);
    if (found === -1) return null;
    // Start-of-word bonus.
    if (found === 0 || t[found - 1] === " " || t[found - 1] === "-") score += 3;
    // Contiguous-run bonus.
    run = found === ti ? run + 1 : 0;
    score += 1 + run;
    indices.push(found);
    ti = found + 1;
  }
  // Prefer shorter targets (tighter matches).
  return { score: score + Math.max(0, 12 - text.length) * 0.1, indices };
}

export function fuzzyScore(query: string, text: string): number {
  return fuzzyMatch(query, text)?.score ?? 0;
}
