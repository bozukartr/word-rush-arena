import assert from "node:assert/strict";
import test from "node:test";
import { generateRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from "../src/domain/room-code.js";
import { scoreWord } from "../src/domain/scoring.js";
import { canBuildWord, normalizeTurkishWord } from "../src/domain/words.js";

test("room codes avoid ambiguous characters", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = generateRoomCode();
    assert.equal(code.length, 6);
    assert.ok([...code].every((character) => ROOM_CODE_ALPHABET.includes(character)));
  }
  assert.equal(normalizeRoomCode(" ab-c 23 "), "ABC23");
});

test("Turkish normalization handles dotted and dotless I", () => {
  assert.equal(normalizeTurkishWord("İYİ"), "iyi");
  assert.equal(normalizeTurkishWord("KIR"), "kır");
});

test("letter inventory is consumed exactly once", () => {
  assert.equal(canBuildWord("ada", ["A", "D", "A"]), true);
  assert.equal(canBuildWord("ada", ["A", "D"]), false);
});

test("score increases with length and capped combo", () => {
  assert.equal(scoreWord("ada", 0), 100);
  assert.equal(scoreWord("oyun", 2), 216);
  assert.equal(scoreWord("kelimeler", 99), 1275);
});
