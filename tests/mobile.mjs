// Run with Playwright available: NODE_PATH=<node_modules> node tests/mobile.mjs
// Loads the real UI, game rules, dictionary helpers and effects in Chromium.
// Only Firebase is replaced with controllable stubs.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const source = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const stripModule = (code) => code.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
const html = (await source('index.html'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<link\b[^>]*>/g, '');
const css = await source('styles.css');
const modules = ['game-core.js', 'words.js', 'effects.js'].map(async (name) => stripModule(await source(name)));
const app = stripModule(await source('app.js')).split('ui.createRoomButton.addEventListener')[0];
const DICTIONARY = ['al', 'ale', 'alem', 'ek', 'el', 'kale', 'kalem', 'kel', 'ol', 'on', 'or', 'sor', 'tur', 'us', 'at', 'ana', 'ata', 'kar', 'nar', 'ses', 'su', 'it'].join('\n');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://localhost:5000');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: `
    const initializeApp = () => ({}), firebaseConfig = {}, appCheckSiteKey = '';
    const getAuth = () => ({currentUser: null}), getFirestore = () => ({});
    class GoogleAuthProvider { setCustomParameters() {} }
    const analyticsSupported = async () => false;
    const doc = (...parts) => parts.join('/'), increment = n => n, serverTimestamp = () => 0;
    let pendingWrite, pendingTransaction;
    const updateDoc = () => new Promise((resolve, reject) => { pendingWrite = {resolve, reject}; });
    const runTransaction = () => new Promise((resolve, reject) => { pendingTransaction = {resolve, reject}; });
    ${(await Promise.all(modules)).join('\n')}
    setDictionaryText(${JSON.stringify(DICTIONARY)});
    ${app}
    window.testGame = {state, ui, renderLetters, selectLetter, backspace, clearWord, shuffleLetters, submitWord, renderCurrentWord, canPlay,
      startSolo, localTick, finishLocalRound, botMove, leaveRoom, rematch, handleGameKey,
      resolveWrite: () => pendingWrite.resolve(), rejectWrite: () => pendingWrite.reject(new Error('offline')),
      rejectSubmission: () => pendingTransaction.reject(new Error('duplicate'))};
  ` });
  assert.deepEqual(errors, [], 'page boots without errors');

  // --- Online board: touch, keyboard, in-flight guards and rollback ---
  await page.evaluate(() => {
    const {state, renderLetters} = testGame;
    state.uid = 'test'; state.roomCode = '12345'; state.currentScreen = 'gameScreen';
    document.addEventListener('keydown', testGame.handleGameKey);
    state.room = { phase: 'playing', round: 1, startsAt: {toMillis: () => Date.now() - 1000}, endsAt: {toMillis: () => Date.now() + 75000} };
    state.playerLetters = ['A','L','E','K','M','İ','O','R','S','T','U','N'];
    state.playerBag = ['A','E','İ','O','U']; state.boardVersion = 1;
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelector('#gameScreen').classList.add('active');
    document.querySelector('#bottomNav').classList.add('hidden');
    document.body.classList.add('in-game'); renderLetters();
  });
  await page.evaluate(() => { window.firstTile = testGame.ui.letterGrid.children[0]; });
  await page.locator('.letter-tile').nth(0).tap();
  await page.locator('.letter-tile').nth(1).tap();
  assert.equal(await page.locator('#currentWord').textContent(), 'AL');
  assert.equal(await page.evaluate(() => firstTile === testGame.ui.letterGrid.children[0]), true);
  assert.equal(await page.locator('#currentWord').getAttribute('data-status'), 'valid', 'dictionary word is highlighted');
  assert.match(await page.locator('#submitWordButton').textContent(), /\+\d+/, 'submit shows points for valid word');
  await page.locator('#letterGrid button').nth(2).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#currentWord').textContent(), 'ALE');
  // Tapping a selected tile removes just that letter.
  await page.locator('.letter-tile').nth(1).tap();
  assert.equal(await page.locator('#currentWord').textContent(), 'AE');
  assert.equal(await page.locator('#currentWord').getAttribute('data-status'), 'unknown');
  await page.locator('.letter-tile').nth(1).tap();
  assert.equal(await page.locator('#currentWord').textContent(), 'AEL');
  await page.evaluate(() => { testGame.clearWord(); testGame.selectLetter(0); testGame.selectLetter(1); testGame.selectLetter(2); });
  assert.equal(await page.locator('#currentWord').textContent(), 'ALE');
  await page.evaluate(() => { testGame.state.submitting = true; testGame.selectLetter(3); testGame.backspace(); testGame.clearWord(); });
  assert.equal(await page.locator('#currentWord').textContent(), 'ALE');
  await page.evaluate(() => { testGame.state.submitting = false; testGame.state.room.endsAt = {toMillis: () => Date.now() - 1}; testGame.renderCurrentWord(); testGame.selectLetter(3); });
  assert.equal(await page.locator('#submitWordButton').isDisabled(), true);
  assert.equal(await page.locator('#shuffleButton').isDisabled(), true);
  assert.equal(await page.locator('#currentWord').textContent(), 'ALE');
  await page.evaluate(() => { testGame.state.room.endsAt = {toMillis: () => Date.now() + 75000}; testGame.clearWord(); window.shuffleTask = testGame.shuffleLetters(); });
  assert.equal(await page.evaluate(() => testGame.state.boardVersion), 2);
  await page.evaluate(async () => { testGame.resolveWrite(); await window.shuffleTask; });
  assert.equal(await page.evaluate(() => testGame.state.boardVersion), 2);
  assert.equal(await page.locator('#shuffleButton').isEnabled(), true);
  // Physical keyboard typing picks matching tiles (Turkish dotted/dotless i aware).
  await page.evaluate(() => { testGame.clearWord(); document.activeElement?.blur(); });
  await page.keyboard.type('al');
  assert.equal(await page.locator('#currentWord').textContent(), 'AL');
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#currentWord').textContent(), 'A');
  // A word already found this round is flagged and cannot be sent.
  await page.evaluate(() => {
    testGame.clearWord();
    testGame.state.submissions = [{ id: 'r1_al', word: 'al', ownerId: 'rival', points: 2, round: 1 }];
    const letters = testGame.state.playerLetters;
    testGame.selectLetter(letters.indexOf('A')); testGame.selectLetter(letters.indexOf('L'));
  });
  assert.equal(await page.locator('#currentWord').getAttribute('data-status'), 'taken');
  assert.equal(await page.locator('#submitWordButton').isDisabled(), true);
  await page.evaluate(() => {
    testGame.state.submissions = [];
    testGame.clearWord();
    const letters = testGame.state.playerLetters;
    testGame.selectLetter(letters.indexOf('A')); testGame.selectLetter(letters.indexOf('L'));
    window.submitTask = testGame.submitWord();
  });
  assert.equal(await page.locator('#submitWordButton').isDisabled(), true);
  await page.evaluate(async () => { testGame.rejectSubmission(); await window.submitTask; });
  assert.equal(await page.evaluate(() => testGame.state.submitting), false);
  assert.equal(await page.evaluate(() => testGame.state.boardVersion), 2);
  for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[844,390]]) {
    await page.setViewportSize({width,height});
    const bounds = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      button: document.querySelector('#submitWordButton').getBoundingClientRect().toJSON(),
      tile: document.querySelector('.letter-tile').getBoundingClientRect().toJSON()
    }));
    assert.ok(bounds.width <= width, `horizontal overflow at ${width}`);
    assert.ok(bounds.tile.height >= 44 && bounds.tile.width >= 44, `tile target at ${width}`);
    if (height >= 568) assert.ok(bounds.button.bottom <= height, `submit below viewport at ${width}: ${bounds.button.bottom}`);
    console.log(`PASS ${width}x${height}: controls fit; tile ${Math.round(bounds.tile.width)}x${Math.round(bounds.tile.height)}`);
  }
  console.log('PASS touch, keyboard, live validation, deselect, taken words, stable DOM, in-flight guards, expired round, shuffle version, submission rollback');

  // --- Offline bot mode: full round without Firebase ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const {state} = testGame;
    Object.assign(state, { uid: null, roomCode: null, room: null, players: [], submissions: [] });
    await testGame.startSolo('easy');
  });
  assert.equal(await page.locator('#gameScreen').evaluate(el => el.classList.contains('active')), true, 'solo opens game screen');
  assert.equal(await page.locator('#combatBar').isHidden(), true, 'power-ups hidden offline');
  assert.equal(await page.locator('.score-pill').count(), 2);
  await page.evaluate(() => {
    const {state} = testGame;
    state.room.startsAt = {toMillis: () => Date.now() - 10};
    state.playerLetters = ['K','A','L','E','M','O','R','S','T','U','N','İ'];
    state.local.bot.letters = ['S','O','R','A','T','U','N','E','K','L','M','İ'];
    testGame.renderLetters();
  });
  assert.equal(await page.evaluate(() => testGame.canPlay()), true);
  for (const index of [0, 1, 2, 3, 4]) await page.locator('.letter-tile').nth(index).tap();
  assert.equal(await page.locator('#currentWord').textContent(), 'KALEM');
  assert.equal(await page.locator('#submitWordButton').isEnabled(), true);
  await page.evaluate(() => testGame.submitWord());
  const afterWord = await page.evaluate(() => ({
    score: testGame.state.players.find(p => p.uid === 'me').score,
    combo: testGame.state.combo,
    chips: testGame.ui.recentWords.textContent,
    letters: testGame.state.playerLetters.length
  }));
  assert.ok(afterWord.score > 0, 'local word scores');
  assert.equal(afterWord.combo, 1);
  assert.match(afterWord.chips, /KALEM/);
  assert.equal(afterWord.letters, 12, 'board refilled');
  await page.evaluate(() => { testGame.state.local.level = { ...testGame.state.local.level, missChance: 0 }; testGame.botMove(); });
  const bot = await page.evaluate(() => testGame.state.players.find(p => p.uid === 'bot'));
  assert.ok(bot.score > 0 && bot.words === 1, 'bot plays a word from its tiles');
  await page.evaluate(() => { testGame.state.room.endsAt = {toMillis: () => Date.now() - 1}; testGame.localTick(Date.now()); });
  assert.equal(await page.locator('#resultsScreen').evaluate(el => el.classList.contains('active')), true, 'round ends on results');
  assert.match(await page.locator('#winnerText').textContent(), /Kazandın|kazandı|Berabere/);
  assert.equal(await page.locator('#rematchButton').isVisible(), true);
  assert.match(await page.locator('#myWordsList').textContent(), /KALEM/);
  const best = await page.evaluate(() => localStorage.getItem('wra-solo-best-easy'));
  assert.equal(Number(best), afterWord.score, 'solo record stored');
  await page.evaluate(() => testGame.rematch());
  assert.equal(await page.evaluate(() => testGame.state.room.round), 2, 'rematch starts next round');
  assert.equal(await page.evaluate(() => testGame.state.roundHistory.length), 1, 'series history kept');
  await page.evaluate(() => testGame.leaveRoom());
  assert.equal(await page.locator('#homeScreen').evaluate(el => el.classList.contains('active')), true);
  assert.equal(await page.evaluate(() => testGame.state.local), null);
  console.log('PASS offline bot mode: start, play, bot move, results, record, rematch, leave');
  assert.deepEqual(errors, [], 'no runtime errors');
} finally { await browser.close(); }
