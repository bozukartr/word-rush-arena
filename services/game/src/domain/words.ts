const TURKISH_LOCALE = "tr-TR";

export function normalizeTurkishWord(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase(TURKISH_LOCALE);
}

export function canBuildWord(word: string, letters: readonly string[]): boolean {
  const available = new Map<string, number>();
  for (const letter of letters) {
    const key = normalizeTurkishWord(letter);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  for (const letter of [...normalizeTurkishWord(word)]) {
    const remaining = available.get(letter) ?? 0;
    if (remaining === 0) return false;
    available.set(letter, remaining - 1);
  }
  return true;
}

// Development fixture only. Replace with a licensed, versioned Turkish dictionary asset.
export const DEVELOPMENT_DICTIONARY = new Set([
  "ada", "aile", "akıl", "alan", "ana", "ara", "arı", "at", "ateş", "ay",
  "bal", "bar", "baş", "bil", "bir", "dal", "dil", "el", "ev", "gül",
  "kal", "kelime", "kır", "masa", "oyun", "sal", "sel", "sen", "söz", "taş",
  "tel", "tur", "yar", "yol", "zor"
].map(normalizeTurkishWord));
