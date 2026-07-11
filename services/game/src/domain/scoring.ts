const BASE_SCORE: Record<number, number> = { 2: 40, 3: 100, 4: 180, 5: 300, 6: 460 };

export function scoreWord(word: string, combo: number): number {
  const length = [...word].length;
  const base = BASE_SCORE[length] ?? (length >= 7 ? 650 + (length - 7) * 100 : 0);
  const multiplier = 1 + Math.min(Math.max(combo, 0), 5) * 0.1;
  return Math.round(base * multiplier);
}
