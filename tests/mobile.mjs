// Run with Playwright available: NODE_PATH=<node_modules> node tests/mobile.mjs
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const html = (await readFile(new URL('../index.html', import.meta.url), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<link\b[^>]*>/g, '');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const app = (await readFile(new URL('../app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\n/gm, '')
  .split('ui.createRoomButton.addEventListener')[0];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://localhost:5000');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: `
    const initializeApp = () => ({}), firebaseConfig = {}, appCheckSiteKey = '';
    const getAuth = () => ({currentUser: null}), getFirestore = () => ({});
    class GoogleAuthProvider { setCustomParameters() {} }
    const analyticsSupported = async () => false, loadDictionary = async () => 1;
    const normalizeWord = value => value.toLocaleLowerCase('tr-TR'), isValidWord = () => true;
    const randomSeedWord = () => 'oyun';
    const haptic = () => {}, pressTile = () => {}, enterScreen = () => {}, invalidWord = () => {};
    const refillTiles = () => {}, acceptedWord = () => {}, comboPop = () => {};
    const doc = (...parts) => parts.join('/'), increment = n => n, serverTimestamp = () => 0;
    let pendingWrite, pendingTransaction;
    const updateDoc = () => new Promise((resolve, reject) => { pendingWrite = {resolve, reject}; });
    const runTransaction = () => new Promise((resolve, reject) => { pendingTransaction = {resolve, reject}; });
    ${app}
    window.testGame = {state, ui, renderLetters, selectLetter, backspace, clearWord, shuffleLetters, submitWord, renderCurrentWord, canPlay,
      resolveWrite: () => pendingWrite.resolve(), rejectWrite: () => pendingWrite.reject(new Error('offline')),
      rejectSubmission: () => pendingTransaction.reject(new Error('duplicate'))};
  ` });
  await page.evaluate(() => {
    const {state, renderLetters} = testGame;
    state.uid = 'test'; state.roomCode = '12345';
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
  await page.locator('#letterGrid button').nth(2).focus();
  await page.keyboard.press('Enter');
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
  await page.evaluate(() => { testGame.selectLetter(0); testGame.selectLetter(1); window.submitTask = testGame.submitWord(); });
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
  console.log('PASS touch, keyboard, stable DOM, in-flight guards, expired round, shuffle version, submission rollback');
} finally { await browser.close(); }
