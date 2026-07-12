let words = null;
let seeds = [];

export function normalizeWord(value) {
  return value.trim().normalize("NFC").toLocaleLowerCase("tr-TR");
}

export async function loadDictionary() {
  if (words) return words.size;
  const response = await fetch("./tr_words.txt", { cache: "force-cache" });
  if (!response.ok) throw new Error("Türkçe sözlük yüklenemedi.");
  const entries = (await response.text())
    .split(/\r?\n/u)
    .map(normalizeWord)
    .filter(Boolean);
  words = new Set(entries);
  seeds = entries.filter((word) => {
    const length = [...word].length;
    return length >= 4 && length <= 7 && /^[abcçdefgğhıijklmnoöprsştuüvyz]+$/u.test(word);
  });
  return words.size;
}

export function isValidWord(value) {
  return words?.has(normalizeWord(value)) ?? false;
}

export function randomSeedWord() {
  if (!seeds.length) return "oyun";
  return seeds[Math.floor(Math.random() * seeds.length)];
}
