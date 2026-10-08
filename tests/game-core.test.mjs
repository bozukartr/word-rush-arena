import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOARD_SIZE, BOT_LEVELS, LETTER_STOCK, VOWELS, chooseBotWord, createLetterBag, createLetters,
  ensureMinimumVowels, indexesForWord, isBotSafe, pointsFor, rankTitle, refillBoard
} from '../game-core.js';
import { findFormableWords, isLikelyStem, isValidWord, normalizeWord, setDictionaryText } from '../words.js';

const sequence = (...values) => { let index = 0; return () => values[index++ % values.length]; };

test('scores letters with length and combo multipliers', () => {
  assert.equal(pointsFor('al'), 2);
  assert.equal(pointsFor('kale'), Math.round((2 + 1 + 1 + 1) * 1.25));
  assert.equal(pointsFor('kalem'), Math.round((2 + 1 + 1 + 1 + 2) * 1.5));
  assert.equal(pointsFor('kalemler'), Math.round((2 + 1 + 1 + 1 + 2 + 1 + 1 + 1) * 2));
  assert.equal(pointsFor('kalem', 3), Math.round(7 * 1.5 * 1.3));
  assert.equal(pointsFor('kalem', 9), pointsFor('kalem', 5), 'combo bonus is capped');
});

test('Turkish dotted and dotless i keep their own letter values', () => {
  assert.equal(pointsFor('ı'), 2);
  assert.equal(pointsFor('i'), 2);
  assert.equal(normalizeWord('  İLAÇ '), 'ilaç');
  assert.equal(normalizeWord('IŞIK'), 'ışık');
});

test('boards have twelve tiles, contain the seed letters and enough vowels', () => {
  for (let run = 0; run < 50; run += 1) {
    const letters = createLetters('kalem');
    assert.equal(letters.length, BOARD_SIZE);
    for (const letter of ['K', 'A', 'L', 'E', 'M']) assert.ok(letters.includes(letter), `missing ${letter}`);
    assert.ok(letters.filter((letter) => VOWELS.has(letter)).length >= 3);
  }
});

test('letter bag respects stock minus tiles on the board', () => {
  const board = ['A', 'A', 'J'];
  const bag = createLetterBag(board);
  const total = Object.values(LETTER_STOCK).reduce((sum, count) => sum + count, 0);
  assert.equal(bag.length, total - board.length);
  assert.equal(bag.filter((letter) => letter === 'J').length, LETTER_STOCK.J - 1);
});

test('refill replaces only used tiles and never mutates its inputs', () => {
  const letters = ['K', 'A', 'L', 'E', 'M', 'T', 'R', 'S', 'N', 'O', 'U', 'İ'];
  const bag = ['B', 'C', 'D'];
  const result = refillBoard(letters, bag, [0, 2]);
  assert.deepEqual(letters, ['K', 'A', 'L', 'E', 'M', 'T', 'R', 'S', 'N', 'O', 'U', 'İ']);
  assert.deepEqual(bag, ['B', 'C', 'D']);
  assert.equal(result.letters.length, 12);
  assert.deepEqual(result.letters.slice(3), letters.slice(3));
  assert.equal(result.bag.length, 1);
});

test('refill tops up an empty bag instead of leaving holes', () => {
  const letters = ['K', 'A', 'L', 'E', 'M', 'T', 'R', 'S', 'N', 'O', 'U', 'İ'];
  const result = refillBoard(letters, [], [0, 1, 2]);
  assert.ok(result.letters.every(Boolean));
});

test('vowel guard swaps consonants for vowels from the bag', () => {
  const letters = ['K', 'L', 'M', 'T', 'R', 'S', 'N', 'B', 'C', 'D', 'P', 'Z'];
  const bag = ['A', 'E', 'O', 'T'];
  ensureMinimumVowels(letters, bag, 3, [0]);
  assert.equal(letters[0], 'A', 'preferred index is replaced first');
  assert.equal(letters.filter((letter) => VOWELS.has(letter)).length, 3);
});

test('word indexes use each tile once and skip blocked letters', () => {
  const letters = ['A', 'L', 'A', 'K'];
  assert.deepEqual(indexesForWord('ala', letters), [0, 1, 2]);
  assert.equal(indexesForWord('alaa', letters), null);
  assert.equal(indexesForWord('ak', letters, (letter) => letter === 'A'), null);
});

test('dictionary finder respects tile counts and Turkish letters', () => {
  setDictionaryText('al\nala\nalal\nkal\nışık\nışı\nilk\nabc-d\n');
  assert.equal(isValidWord('IŞIK'), true);
  assert.deepEqual(findFormableWords(['A', 'L', 'A', 'K']).sort(), ['al', 'ala', 'kal']);
  assert.deepEqual(findFormableWords(['I', 'Ş', 'I', 'K']).sort(), ['ışı', 'ışık']);
  assert.deepEqual(findFormableWords(['İ', 'L', 'K']), ['ilk']);
  assert.deepEqual(findFormableWords(['A', 'L', 'A', 'K'], { minLength: 3, maxLength: 3 }).sort(), ['ala', 'kal']);
  assert.equal(isLikelyStem('alal'), true, 'vowel + l on top of a real word is a stem');
  assert.equal(isLikelyStem('kal'), false);
});

test('bot picks unclaimed words within its length band', () => {
  const level = { ...BOT_LEVELS.medium, missChance: 0, pickTop: 1 };
  const word = chooseBotWord(['ev', 'kale', 'kalem', 'kalemlik'], level, new Set(['kale']), sequence(.5, 0));
  assert.equal(word, 'kalem');
  assert.equal(chooseBotWord(['ev'], level, new Set(), sequence(.5)), null);
  assert.equal(chooseBotWord(['kale'], { ...level, missChance: 1 }, new Set(), sequence(.1)), null);
});

test('hard bot prefers the highest scoring words', () => {
  const level = { ...BOT_LEVELS.hard, missChance: 0, pickTop: .01 };
  assert.equal(chooseBotWord(['kale', 'jüri', 'el'], level, new Set(), () => 0), 'jüri');
});

test('bot never plays slurs from the source dictionary', () => {
  assert.equal(isBotSafe('kalem'), true);
  assert.equal(isBotSafe('götür'), true, 'innocent words sharing a prefix stay playable');
  for (const word of ['ibne', 'orospu', 'piç', 'göt', 'sikik']) assert.equal(isBotSafe(word), false, word);
  const level = { ...BOT_LEVELS.easy, missChance: 0 };
  assert.equal(chooseBotWord(['ibne', 'göt'], level, new Set(), () => 0), null);
});

test('bot skips truncated dictionary stems but keeps natural clusters', () => {
  for (const word of ['pisl', 'adanm', 'övm', 'abukl']) assert.equal(isBotSafe(word), false, word);
  for (const word of ['renk', 'kent', 'dost', 'aşk', 'kalp', 'kalem', 'su']) assert.equal(isBotSafe(word), true, word);
});

test('rank tiers progress with wins', () => {
  assert.equal(rankTitle(0).title, 'Çaylak');
  assert.equal(rankTitle(3).title, 'Kalfa');
  assert.equal(rankTitle(9).next, 'Usta');
  assert.equal(rankTitle(60).progress, 1);
  assert.ok(Math.abs(rankTitle(6).progress - 3 / 7) < 1e-9);
});

test('real dictionary offers playable words on generated boards', () => {
  setDictionaryText(readFileSync(new URL('../tr_words.txt', import.meta.url), 'utf8'));
  for (let run = 0; run < 20; run += 1) {
    const letters = createLetters('oyun');
    const found = findFormableWords(letters, { minLength: 3, maxLength: 7 });
    assert.ok(found.length >= 5, `too few words for ${letters.join('')}`);
    for (const word of found.slice(0, 20)) assert.ok(indexesForWord(word, letters), `${word} not formable`);
  }
});
