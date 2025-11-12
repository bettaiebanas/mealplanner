// src/lib/fuzzyMatch.ts
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function score(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;

  // très léger : points pour tokens communs + pénalité longueur
  const as = new Set(na.split(" "));
  const bs = new Set(nb.split(" "));
  let common = 0;
  for (const t of as) if (bs.has(t)) common++;

  const lenPenalty = Math.abs(na.length - nb.length) / 100;
  return common - lenPenalty;
}

export function bestMatch<T extends { label: string }>(
  needle: string,
  hay: T[],
): { item: T | null; score: number } {
  let best: T | null = null;
  let bestScore = -1e9;
  for (const it of hay) {
    const sc = score(needle, it.label);
    if (sc > bestScore) {
      best = it;
      bestScore = sc;
    }
  }
  return { item: best, score: bestScore };
}
