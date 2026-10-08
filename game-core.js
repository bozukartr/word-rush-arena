// Pure game rules shared by online rooms, the offline bot mode and the tests.
// Nothing in this module touches the DOM, Firebase or timers.

export const BOARD_SIZE = 12;
export const MIN_VOWELS = 3;
export const COMBO_WINDOW_MS = 10000;
export const MAX_COMBO = 5;

export const LETTER_POINTS = Object.freeze({
  A: 1, B: 3, C: 4, Ç: 4, D: 3, E: 1, F: 7, G: 5, Ğ: 8,
  H: 5, I: 2, İ: 2, J: 10, K: 2, L: 1, M: 2, N: 1, O: 2,
  Ö: 7, P: 5, R: 1, S: 2, Ş: 4, T: 1, U: 2, Ü: 3, V: 7,
  Y: 5, Z: 4
});
export const LETTER_STOCK = Object.freeze({
  A: 13, B: 2, C: 2, Ç: 2, D: 2, E: 8, F: 1, G: 1, Ğ: 1,
  H: 1, I: 4, İ: 7, J: 1, K: 7, L: 7, M: 4, N: 5, O: 3,
  Ö: 1, P: 1, R: 6, S: 3, Ş: 2, T: 5, U: 3, Ü: 2, V: 1,
  Y: 3, Z: 2
});
export const VOWELS = new Set(["A", "E", "I", "İ", "O", "Ö", "U", "Ü"]);

export function upperTr(value) { return String(value).toLocaleUpperCase("tr-TR"); }

export function letterPoint(letter) {
  return LETTER_POINTS[upperTr(letter)] ?? 1;
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function createFullLetterBag() {
  return shuffle(Object.entries(LETTER_STOCK).flatMap(([letter, count]) => Array(count).fill(letter)));
}

export function createLetterBag(usedLetters = []) {
  const bag = createFullLetterBag();
  for (const letter of usedLetters) {
    const index = bag.indexOf(letter);
    if (index >= 0) bag.splice(index, 1);
  }
  return shuffle(bag);
}

export function topUpBag(bag, referenceLetters) {
  if (!bag.length) bag.push(...createLetterBag(referenceLetters));
}

export function ensureMinimumVowels(letters, bag, minimum = MIN_VOWELS, preferredIndexes = null, lockedIndexes = []) {
  let missing = minimum - letters.filter((letter) => VOWELS.has(letter)).length;
  if (missing <= 0) return;
  const preferred = preferredIndexes?.filter((index) => letters[index] && !VOWELS.has(letters[index])) ?? [];
  const fallback = letters.map((letter, index) => ({ letter, index }))
    .filter(({ letter, index }) => letter && !VOWELS.has(letter) && !preferred.includes(index) && !lockedIndexes.includes(index))
    .map(({ index }) => index);
  const replaceable = [...preferred, ...fallback];
  while (missing > 0 && replaceable.length) {
    const vowelIndex = bag.findIndex((letter) => VOWELS.has(letter));
    if (vowelIndex < 0) break;
    const boardIndex = replaceable.shift();
    const [vowel] = bag.splice(vowelIndex, 1);
    bag.unshift(letters[boardIndex]);
    letters[boardIndex] = vowel;
    missing -= 1;
  }
}

// Builds a 12-letter board that always contains the seed word's letters.
export function createLetters(seedWord) {
  const bag = createFullLetterBag();
  const letters = [];
  for (const letter of [...upperTr(seedWord ?? "")]) {
    const index = bag.indexOf(letter);
    if (index >= 0 && letters.length < BOARD_SIZE) letters.push(...bag.splice(index, 1));
  }
  const seedLength = letters.length;
  while (letters.length < BOARD_SIZE) letters.push(bag.pop());
  // Only filler tiles may become vowels, so the seed word stays playable.
  const seedIndexes = Array.from({ length: seedLength }, (_, index) => index);
  ensureMinimumVowels(letters, bag, MIN_VOWELS, null, seedIndexes);
  return shuffle(letters);
}

// Replaces the tiles used for a word and returns the new board and bag.
// Inputs are never mutated so callers can roll back easily.
export function refillBoard(letters, bag, usedIndexes) {
  const nextLetters = [...letters];
  const nextBag = [...bag];
  for (const index of usedIndexes) {
    topUpBag(nextBag, nextLetters);
    nextLetters[index] = nextBag.pop();
  }
  ensureMinimumVowels(nextLetters, nextBag, MIN_VOWELS, usedIndexes);
  return { letters: nextLetters, bag: nextBag };
}

export function lengthMultiplier(length) {
  if (length <= 3) return 1;
  if (length === 4) return 1.25;
  if (length === 5) return 1.5;
  if (length === 6) return 1.75;
  return 2;
}

export function comboMultiplier(combo) {
  return 1 + Math.min(Math.max(combo, 0), MAX_COMBO) * .1;
}

export function pointsFor(word, combo = 0) {
  const letters = [...upperTr(word)];
  const letterTotal = letters.reduce((total, letter) => total + letterPoint(letter), 0);
  return Math.round(letterTotal * lengthMultiplier(letters.length) * comboMultiplier(combo));
}

// Maps a word onto board indexes, preferring tiles that are not blocked.
export function indexesForWord(word, letters, isBlocked = () => false) {
  const used = new Set();
  const indexes = [];
  for (const letter of [...upperTr(word)]) {
    const index = letters.findIndex((candidate, position) => candidate === letter && !used.has(position) && !isBlocked(candidate));
    if (index < 0) return null;
    used.add(index);
    indexes.push(index);
  }
  return indexes;
}

export function rankTitle(wins = 0) {
  const tiers = [
    { min: 0, title: "Çaylak" }, { min: 3, title: "Kalfa" }, { min: 10, title: "Usta" },
    { min: 25, title: "Üstat" }, { min: 50, title: "Efsane" }
  ];
  let index = 0;
  while (index + 1 < tiers.length && wins >= tiers[index + 1].min) index += 1;
  const current = tiers[index];
  const next = tiers[index + 1] ?? null;
  const progress = next ? (wins - current.min) / (next.min - current.min) : 1;
  return { title: current.title, level: index + 1, next: next?.title ?? null, nextAt: next?.min ?? null, progress };
}

// Tuned so a casual player beats easy, a regular player trades rounds with
// medium, and hard needs fast, long words (about 40 / 100 / 200 points).
export const BOT_LEVELS = Object.freeze({
  easy: { id: "easy", name: "Çaylak Bot", label: "Kolay", delay: [8500, 12500], minLength: 3, maxLength: 4, pickTop: 1, missChance: .2 },
  medium: { id: "medium", name: "Usta Bot", label: "Orta", delay: [6000, 9000], minLength: 3, maxLength: 5, pickTop: .6, missChance: .1 },
  hard: { id: "hard", name: "Efsane Bot", label: "Zor", delay: [4900, 6900], minLength: 4, maxLength: 7, pickTop: .35, missChance: .05 }
});

export function botDelay(level, random = Math.random) {
  const [min, max] = level.delay;
  return Math.round(min + random() * (max - min));
}

// The source dictionary contains slang; the bot should never play it.
const BOT_BLOCKED_PREFIXES = ["ibne", "kahpe", "kaltak", "orospu", "pezevenk", "puşt", "sik", "yarra", "amcı", "piç", "gavat", "sürtük", "yavşak", "taşak", "dalyarak"];
const BOT_BLOCKED_WORDS = new Set(["am", "göt", "götlek", "döl", "salak", "aptal", "gerzek"]);

// Hunspell roots include truncated stems such as "pisl" or "adanm". Real
// Turkish words rarely end in two consonants outside these clusters.
const NATURAL_FINAL_CLUSTERS = new Set(["nk", "nt", "rt", "st", "rk", "lk", "ns", "ks", "şt", "lt", "ft", "rp", "rf", "nç", "rç", "lç", "sk", "şk", "lp"]);
const LOWER_VOWELS = new Set([..."aeıioöuü"]);

function looksLikeStem(word) {
  const letters = [...word];
  if (letters.length < 2) return false;
  const [last, previous] = [letters.at(-1), letters.at(-2)];
  return !LOWER_VOWELS.has(last) && !LOWER_VOWELS.has(previous) && !NATURAL_FINAL_CLUSTERS.has(previous + last);
}

export function isBotSafe(word) {
  return !BOT_BLOCKED_WORDS.has(word) && !BOT_BLOCKED_PREFIXES.some((prefix) => word.startsWith(prefix)) && !looksLikeStem(word);
}

// Picks a word for the bot from candidates; harder bots favour higher scores.
export function chooseBotWord(candidates, level, taken = new Set(), random = Math.random) {
  if (random() < level.missChance) return null;
  const pool = candidates
    .filter((word) => !taken.has(word) && isBotSafe(word))
    .filter((word) => {
      const length = [...word].length;
      return length >= level.minLength && length <= level.maxLength;
    })
    .map((word) => ({ word, points: pointsFor(word) }))
    .sort((a, b) => b.points - a.points);
  if (!pool.length) return null;
  const window = Math.max(1, Math.ceil(pool.length * level.pickTop));
  return pool[Math.floor(random() * window)].word;
}
