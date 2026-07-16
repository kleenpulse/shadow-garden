// Lightweight subsequence fuzzy scorer for the sidebar filter. Returns 0 for no
// match; higher is better. Rewards contiguous runs and start-of-word hits — the
// same ranking spirit as the command palette, without coupling to cmdk internals.
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();

  let score = 0;
  let ti = 0;
  let run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const char = q[qi];
    const found = t.indexOf(char, ti);
    if (found === -1) return 0;
    // Start-of-word bonus.
    if (found === 0 || t[found - 1] === " " || t[found - 1] === "-") score += 3;
    // Contiguous-run bonus.
    run = found === ti ? run + 1 : 0;
    score += 1 + run;
    ti = found + 1;
  }
  // Prefer shorter targets (tighter matches).
  return score + Math.max(0, 12 - text.length) * 0.1;
}
