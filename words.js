const TR_LETTERS = "abcçdefgğhıijklmnoöprsştuüvyz";
const LETTER_INDEX = new Map([...TR_LETTERS].map((letter, index) => [letter, index]));
const PLAIN_WORD = /^[abcçdefgğhıijklmnoöprsştuüvyz]+$/u;

let words = null;
let seeds = [];
// Pre-split playable words so the bot can scan the dictionary quickly.
let playable = [];
let pending = null;

export function normalizeWord(value) {
  return value.trim().normalize("NFC").toLocaleLowerCase("tr-TR");
}

export function setDictionaryText(text) {
  const entries = text.split(/\r?\n/u).map(normalizeWord).filter(Boolean);
  words = new Set(entries);
  playable = [];
  seeds = [];
  for (const word of entries) {
    if (!PLAIN_WORD.test(word)) continue;
    const letters = [...word];
    if (letters.length < 2 || letters.length > 12) continue;
    playable.push({ word, codes: Uint8Array.from(letters, (letter) => LETTER_INDEX.get(letter)) });
    if (letters.length >= 4 && letters.length <= 7) seeds.push(word);
  }
  return words.size;
}

export async function loadDictionary() {
  if (words) return words.size;
  pending ??= (async () => {
    const response = await fetch("./tr_words.txt", { cache: "force-cache" });
    if (!response.ok) throw new Error("Türkçe sözlük yüklenemedi.");
    return setDictionaryText(await response.text());
  })();
  try { return await pending; }
  catch (error) { pending = null; throw error; }
}

export function isDictionaryReady() { return Boolean(words); }

export function isValidWord(value) {
  return words?.has(normalizeWord(value)) ?? false;
}

export function randomSeedWord() {
  if (!seeds.length) return "oyun";
  return seeds[Math.floor(Math.random() * seeds.length)];
}

// Returns every dictionary word that can be spelled with the given tiles.
export function findFormableWords(letters, { minLength = 2, maxLength = 12 } = {}) {
  const available = new Uint8Array(TR_LETTERS.length);
  for (const letter of letters) {
    const index = LETTER_INDEX.get(normalizeWord(String(letter ?? "")));
    if (index !== undefined) available[index] += 1;
  }
  const counts = new Uint8Array(TR_LETTERS.length);
  const found = [];
  for (const entry of playable) {
    if (entry.codes.length < minLength || entry.codes.length > maxLength) continue;
    counts.set(available);
    let fits = true;
    for (const code of entry.codes) {
      if (counts[code] === 0) { fits = false; break; }
      counts[code] -= 1;
    }
    if (fits) found.push(entry.word);
  }
  return found;
}

// Truncated suffix stems ("üyes" from "üyesi", "kuklal" from "kuklalı") are
// in the source dictionary. Players may still submit them; the bot avoids them.
const VOWEL_SET = new Set([..."aeıioöuü"]);
export function isLikelyStem(word) {
  const letters = [...word];
  if (letters.length < 3 || !words) return false;
  const last = letters.at(-1);
  return (last === "s" || last === "l") && VOWEL_SET.has(letters.at(-2)) && words.has(letters.slice(0, -1).join(""));
}
