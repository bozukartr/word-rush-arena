import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported, logEvent } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  Timestamp, collection, connectFirestoreEmulator, doc, getDoc, getDocs,
  getFirestore, increment, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { appCheckSiteKey, firebaseConfig } from "./firebase-config.js";
import { isValidWord, loadDictionary, normalizeWord, randomSeedWord } from "./words.js";

const app = initializeApp(firebaseConfig);
if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
let analytics = null;
analyticsSupported().then((supported) => { if (supported) analytics = getAnalytics(app); });

const emulatorMode = location.hostname === "localhost" && new URLSearchParams(location.search).has("emulator");
if (emulatorMode) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
}

const $ = (id) => document.getElementById(id);
const screens = ["loadingScreen", "homeScreen", "lobbyScreen", "gameScreen", "resultsScreen"];
const ui = Object.fromEntries([
  "connectionBadge", "leaveButton", "playerName", "roomCodeInput", "createRoomButton", "joinRoomButton",
  "roomCodeText", "copyCodeButton", "playerCount", "lobbyPlayers", "readyButton", "startButton",
  "timerText", "scoreStrip", "rankText", "gameStatus", "comboText", "letterGrid", "currentWord",
  "backspaceButton", "clearButton", "submitWordButton", "recentWords", "winnerText", "resultsList",
  "rematchButton", "rematchStatus", "homeButton", "toast"
].map((id) => [id, $(id)]));

const dictionaryReady = loadDictionary();

const state = {
  uid: null,
  roomCode: null,
  room: null,
  players: [],
  selected: [],
  recentWords: [],
  combo: 0,
  submitting: false,
  ready: false,
  unsubscribers: [],
  timer: null,
  heartbeat: null,
  toastTimer: null
};

function showScreen(id) {
  for (const screen of screens) $(screen).classList.toggle("active", screen === id);
  ui.leaveButton.classList.toggle("hidden", !state.roomCode);
}

function setConnection(mode, text) {
  ui.connectionBadge.className = `connection-badge ${mode}`;
  ui.connectionBadge.querySelector("span").textContent = text;
}

function toast(message, error = false) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `toast show${error ? " error" : ""}`;
  state.toastTimer = setTimeout(() => { ui.toast.className = "toast"; }, 2600);
}

function track(name, params = {}) {
  if (analytics) logEvent(analytics, name, params);
}

function cleanName() {
  const value = ui.playerName.value.trim().replace(/\s+/g, " ");
  if (value.length < 2) throw new Error("Oyuncu adı en az 2 karakter olmalı.");
  localStorage.setItem("wra-player-name", value);
  return value;
}

function cleanCode() {
  const value = ui.roomCodeInput.value.replace(/\D/g, "").slice(0, 5);
  if (value.length !== 5) throw new Error("5 haneli oda kodunu gir.");
  return value;
}

function roomRef(code = state.roomCode) { return doc(db, "rooms", code); }
function playerRef(uid = state.uid, code = state.roomCode) { return doc(db, "rooms", code, "players", uid); }

function randomCode() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function createLetters() {
  const seed = randomSeedWord();
  const pool = "AAAAABCDEEEFGĞHIIİJKLMNOÖPRSTUÜVYZ";
  const letters = [...seed.toLocaleUpperCase("tr-TR")];
  while (letters.length < 12) letters.push(pool[Math.floor(Math.random() * pool.length)]);
  return shuffle(letters.slice(0, 12));
}

async function createRoom() {
  try {
    setBusy(true);
    const name = cleanName();
    let code;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = randomCode();
      const created = await runTransaction(db, async (transaction) => {
        const ref = roomRef(candidate);
        if ((await transaction.get(ref)).exists()) return false;
        transaction.set(ref, {
          hostId: state.uid, phase: "lobby", round: 0, maxPlayers: 4, letters: [], endsAt: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        transaction.set(playerRef(state.uid, candidate), {
          name, score: 0, words: 0, round: 0, ready: false, connected: true,
          joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp()
        });
        return true;
      });
      if (created) { code = candidate; break; }
    }
    if (!code) throw new Error("Oda kodu üretilemedi. Tekrar dene.");
    track("room_create");
    await enterRoom(code);
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

async function joinRoom() {
  try {
    setBusy(true);
    const name = cleanName();
    const code = cleanCode();
    const ref = roomRef(code);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw new Error("Oda bulunamadı.");
    if (snapshot.data().phase !== "lobby") throw new Error("Bu odada maç başlamış.");
    const playerSnapshots = await getDocs(query(collection(ref, "players"), limit(5)));
    if (playerSnapshots.size >= 4 && !playerSnapshots.docs.some((item) => item.id === state.uid)) throw new Error("Oda dolu.");
    await setDoc(playerRef(state.uid, code), {
      name, score: 0, words: 0, round: snapshot.data().round ?? 0, ready: false, connected: true,
      joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp()
    }, { merge: true });
    track("room_join");
    await enterRoom(code);
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

async function enterRoom(code) {
  leaveListeners();
  state.roomCode = code;
  state.selected = [];
  state.recentWords = [];
  ui.roomCodeText.textContent = code;
  state.unsubscribers.push(onSnapshot(roomRef(), (snapshot) => {
    if (!snapshot.exists()) { toast("Oda kapatıldı.", true); leaveRoom(); return; }
    state.room = snapshot.data();
    routeRoomPhase();
  }, () => toast("Oda verisi okunamadı.", true)));
  state.unsubscribers.push(onSnapshot(query(collection(roomRef(), "players"), orderBy("score", "desc")), (snapshot) => {
    state.players = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
    const me = state.players.find((player) => player.uid === state.uid);
    state.ready = Boolean(me?.ready) && me?.round === (state.room?.round ?? 0);
    renderPlayers();
    renderScores();
    renderResults();
  }));
  clearInterval(state.heartbeat);
  state.heartbeat = setInterval(() => updateDoc(playerRef(), { connected: true, lastSeenAt: serverTimestamp() }).catch(() => {}), 20000);
}

function routeRoomPhase() {
  if (!state.room) return;
  if (state.room.phase === "lobby") {
    showScreen("lobbyScreen");
    syncMyRound();
    renderPlayers();
  } else if (state.room.phase === "playing") {
    showScreen("gameScreen");
    renderLetters();
    startTimer();
  } else if (state.room.phase === "results") {
    clearInterval(state.timer);
    showScreen("resultsScreen");
    renderResults();
  }
}

async function syncMyRound() {
  const me = state.players.find((player) => player.uid === state.uid);
  const round = state.room?.round ?? 0;
  if (!me || me.round === round) return;
  await updateDoc(playerRef(), {
    round, score: 0, words: 0, ready: false, lastSeenAt: serverTimestamp()
  }).catch(() => {});
}

function currentRoundPlayer(player) {
  const active = player.round === (state.room?.round ?? 0);
  return {
    ...player,
    score: active ? (player.score ?? 0) : 0,
    words: active ? (player.words ?? 0) : 0,
    ready: active ? Boolean(player.ready) : false
  };
}

function renderPlayers() {
  ui.playerCount.textContent = `${state.players.length} / 4`;
  const players = state.players.map(currentRoundPlayer);
  ui.lobbyPlayers.replaceChildren(...players.map((player, index) => {
    const card = document.createElement("div");
    card.className = "player-card";
    card.innerHTML = `<div class="avatar">${index + 1}</div><div class="player-meta"><strong></strong><span></span></div><div class="ready-mark"></div>`;
    card.querySelector("strong").textContent = player.name;
    card.querySelector("span").textContent = player.uid === state.room?.hostId ? "Oda sahibi" : (player.connected ? "Bağlı" : "Bağlantı koptu");
    const mark = card.querySelector(".ready-mark");
    mark.textContent = player.ready ? "HAZIR ✓" : "BEKLİYOR";
    mark.classList.toggle("yes", Boolean(player.ready));
    return card;
  }));
  ui.readyButton.textContent = state.ready ? "HAZIR DEĞİLİM" : "HAZIRIM";
  const isHost = state.room?.hostId === state.uid;
  ui.startButton.classList.toggle("hidden", !isHost);
  ui.startButton.disabled = players.length < 2 || players.some((player) => !player.ready);
  ui.rematchButton.classList.toggle("hidden", !isHost);
}

function renderScores() {
  if (!state.players.length) return;
  const players = state.players.map(currentRoundPlayer).sort((a, b) => b.score - a.score);
  ui.scoreStrip.replaceChildren(...players.slice(0, 3).map((player) => {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    pill.innerHTML = "<span></span><strong></strong>";
    pill.querySelector("span").textContent = player.name;
    pill.querySelector("strong").textContent = player.score ?? 0;
    return pill;
  }));
  const rank = players.findIndex((player) => player.uid === state.uid);
  ui.rankText.textContent = rank < 0 ? "–" : `#${rank + 1}`;
}

function renderLetters() {
  const letters = state.room?.letters ?? [];
  ui.letterGrid.replaceChildren(...letters.map((letter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `letter-tile${state.selected.includes(index) ? " selected" : ""}`;
    button.textContent = letter;
    button.ariaLabel = `${letter} harfi`;
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); selectLetter(index); });
    return button;
  }));
  renderCurrentWord();
}

function selectLetter(index) {
  if (state.selected.includes(index) || state.room?.phase !== "playing") return;
  state.selected.push(index);
  vibrate(8);
  renderLetters();
}

function currentWord() {
  return state.selected.map((index) => state.room.letters[index]).join("");
}

function renderCurrentWord() {
  const word = currentWord();
  ui.currentWord.textContent = "";
  if (word) ui.currentWord.textContent = word;
  else ui.currentWord.innerHTML = "<span>Harfleri seç</span>";
  ui.submitWordButton.disabled = !word || state.submitting;
}

function backspace() { state.selected.pop(); renderLetters(); }
function clearWord() { state.selected = []; renderLetters(); }

function pointsFor(word) {
  const length = [...word].length;
  const base = ({ 2: 40, 3: 100, 4: 180, 5: 300, 6: 460 })[length] ?? (length >= 7 ? 650 + (length - 7) * 100 : 0);
  return Math.round(base * (1 + Math.min(state.combo, 5) * .1));
}

async function submitWord() {
  if (state.submitting) return;
  const displayed = currentWord();
  const word = normalizeWord(displayed);
  if ([...word].length < 2) { toast("Kelime çok kısa.", true); return; }
  if (!isValidWord(word)) { state.combo = 0; toast("Bu kelime sözlükte yok.", true); vibrate([30, 30, 30]); return; }
  state.submitting = true;
  renderCurrentWord();
  try {
    const points = pointsFor(word);
    await runTransaction(db, async (transaction) => {
      const currentRoom = await transaction.get(roomRef());
      if (!currentRoom.exists() || currentRoom.data().phase !== "playing") throw new Error("Tur sona erdi.");
      if (currentRoom.data().endsAt.toMillis() <= Date.now()) throw new Error("Süre doldu.");
      const round = currentRoom.data().round ?? 0;
      const submissionRef = doc(roomRef(), "submissions", `r${round}_${word}`);
      if ((await transaction.get(submissionRef)).exists()) throw new Error("Bu kelime daha önce bulundu.");
      transaction.set(submissionRef, { word, ownerId: state.uid, points, createdAt: serverTimestamp() });
      transaction.update(playerRef(), { score: increment(points), words: increment(1), lastSeenAt: serverTimestamp() });
    });
    state.combo += 1;
    state.recentWords.unshift(word);
    state.recentWords = state.recentWords.slice(0, 6);
    ui.gameStatus.textContent = `${displayed} kabul edildi · +${points}`;
    ui.comboText.textContent = state.combo > 1 ? `x${state.combo} SERİ` : "";
    ui.recentWords.replaceChildren(...state.recentWords.map((item) => { const chip = document.createElement("span"); chip.className = "word-chip"; chip.textContent = item; return chip; }));
    vibrate(18);
    track("word_accepted", { length: [...word].length, points });
    clearWord();
  } catch (error) {
    state.combo = 0;
    ui.comboText.textContent = "";
    toast(error.message, true);
  } finally {
    state.submitting = false;
    renderCurrentWord();
  }
}

function startTimer() {
  clearInterval(state.timer);
  const tick = async () => {
    const end = state.room?.endsAt?.toMillis?.() ?? 0;
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    ui.timerText.textContent = remaining;
    if (remaining === 0 && state.room?.phase === "playing" && state.room.hostId === state.uid) {
      await updateDoc(roomRef(), { phase: "results", updatedAt: serverTimestamp() }).catch(() => {});
    }
  };
  tick();
  state.timer = setInterval(tick, 250);
}

async function toggleReady() {
  await updateDoc(playerRef(), { ready: !state.ready, lastSeenAt: serverTimestamp() });
  vibrate(10);
}

async function startMatch() {
  const players = state.players.map(currentRoundPlayer);
  if (state.room?.hostId !== state.uid || players.length < 2 || players.some((player) => !player.ready)) return;
  await updateDoc(roomRef(), {
    phase: "playing", letters: createLetters(), endsAt: Timestamp.fromMillis(Date.now() + 75000), updatedAt: serverTimestamp()
  });
  track("match_start", { players: state.players.length });
}

function renderResults() {
  if (!state.players.length) return;
  const sorted = state.players.map(currentRoundPlayer).sort((a, b) => b.score - a.score);
  ui.winnerText.textContent = `${sorted[0].name} kazandı!`;
  ui.resultsList.replaceChildren(...sorted.map((player, index) => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span class="result-rank">#${index + 1}</span><strong></strong><b></b>`;
    row.querySelector("strong").textContent = player.name;
    row.querySelector("b").textContent = `${player.score ?? 0} puan`;
    return row;
  }));
  ui.rematchStatus.textContent = state.room?.hostId === state.uid ? "" : "Oda sahibi yeni turu başlatabilir";
}

async function rematch() {
  if (state.room?.hostId !== state.uid) return;
  await updateDoc(roomRef(), {
    phase: "lobby", round: increment(1), letters: [], endsAt: null, updatedAt: serverTimestamp()
  });
  state.combo = 0;
  state.recentWords = [];
}

async function copyCode() {
  await navigator.clipboard.writeText(state.roomCode);
  toast("Oda kodu kopyalandı.");
}

function leaveListeners() {
  for (const unsubscribe of state.unsubscribers) unsubscribe();
  state.unsubscribers = [];
  clearInterval(state.timer);
  clearInterval(state.heartbeat);
}

async function leaveRoom() {
  if (state.roomCode && state.uid) await updateDoc(playerRef(), { connected: false, lastSeenAt: serverTimestamp() }).catch(() => {});
  leaveListeners();
  Object.assign(state, { roomCode: null, room: null, players: [], selected: [], recentWords: [], combo: 0, ready: false });
  showScreen("homeScreen");
}

function setBusy(value) {
  ui.createRoomButton.disabled = value;
  ui.joinRoomButton.disabled = value;
}

function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

ui.createRoomButton.addEventListener("click", createRoom);
ui.joinRoomButton.addEventListener("click", joinRoom);
ui.roomCodeInput.addEventListener("input", () => { ui.roomCodeInput.value = ui.roomCodeInput.value.replace(/\D/g, "").slice(0, 5); });
ui.roomCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinRoom(); });
ui.copyCodeButton.addEventListener("click", copyCode);
ui.readyButton.addEventListener("click", toggleReady);
ui.startButton.addEventListener("click", startMatch);
ui.backspaceButton.addEventListener("click", backspace);
ui.clearButton.addEventListener("click", clearWord);
ui.submitWordButton.addEventListener("click", submitWord);
ui.rematchButton.addEventListener("click", rematch);
ui.homeButton.addEventListener("click", leaveRoom);
ui.leaveButton.addEventListener("click", leaveRoom);
window.addEventListener("online", () => setConnection("online", "Çevrimiçi"));
window.addEventListener("offline", () => setConnection("offline", "Çevrimdışı"));
window.addEventListener("beforeunload", () => { if (state.roomCode) updateDoc(playerRef(), { connected: false }).catch(() => {}); });

ui.playerName.value = localStorage.getItem("wra-player-name") ?? "";
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try { await dictionaryReady; }
  catch (error) { toast(error.message, true); return; }
  state.uid = user.uid;
  setConnection("online", "Çevrimiçi");
  showScreen("homeScreen");
  track("app_ready");
});

signInAnonymously(auth).catch((error) => {
  setConnection("offline", "Bağlantı hatası");
  toast(`Firebase giriş hatası: ${error.code ?? error.message}`, true);
});
