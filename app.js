import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported, logEvent } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  Timestamp, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, increment, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { appCheckSiteKey, firebaseConfig } from "./firebase-config.js";
import { SEED_WORDS, isValidWord, normalizeWord } from "./words.js";

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
  "rematchButton", "homeButton", "toast"
].map((id) => [id, $(id)]));

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
  const value = ui.roomCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (value.length !== 6) throw new Error("6 karakterli oda kodunu gir.");
  return value;
}

function roomRef(code = state.roomCode) { return doc(db, "rooms", code); }
function playerRef(uid = state.uid, code = state.roomCode) { return doc(db, "rooms", code, "players", uid); }

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
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
  const seed = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
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
          hostId: state.uid, phase: "lobby", maxPlayers: 4, letters: [], endsAt: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        transaction.set(playerRef(state.uid, candidate), {
          name, score: 0, words: 0, ready: false, connected: true,
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
      name, score: 0, words: 0, ready: false, connected: true,
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
    state.ready = Boolean(me?.ready);
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

function renderPlayers() {
  ui.playerCount.textContent = `${state.players.length} / 4`;
  ui.lobbyPlayers.replaceChildren(...state.players.map((player, index) => {
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
  ui.startButton.disabled = state.players.length < 2 || state.players.some((player) => !player.ready);
  ui.rematchButton.classList.toggle("hidden", !isHost);
}

function renderScores() {
  if (!state.players.length) return;
  ui.scoreStrip.replaceChildren(...state.players.slice(0, 3).map((player) => {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    pill.innerHTML = "<span></span><strong></strong>";
    pill.querySelector("span").textContent = player.name;
    pill.querySelector("strong").textContent = player.score ?? 0;
    return pill;
  }));
  const rank = state.players.findIndex((player) => player.uid === state.uid);
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
      const submissionRef = doc(roomRef(), "submissions", word);
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
  if (state.room?.hostId !== state.uid || state.players.length < 2 || state.players.some((player) => !player.ready)) return;
  await updateDoc(roomRef(), {
    phase: "playing", letters: createLetters(), endsAt: Timestamp.fromMillis(Date.now() + 75000), updatedAt: serverTimestamp()
  });
  track("match_start", { players: state.players.length });
}

function renderResults() {
  if (!state.players.length) return;
  const sorted = [...state.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  ui.winnerText.textContent = `${sorted[0].name} kazandı!`;
  ui.resultsList.replaceChildren(...sorted.map((player, index) => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span class="result-rank">#${index + 1}</span><strong></strong><b></b>`;
    row.querySelector("strong").textContent = player.name;
    row.querySelector("b").textContent = `${player.score ?? 0} puan`;
    return row;
  }));
}

async function rematch() {
  if (state.room?.hostId !== state.uid) return;
  const submissions = await getDocs(collection(roomRef(), "submissions"));
  const batch = writeBatch(db);
  submissions.forEach((item) => batch.delete(item.ref));
  state.players.forEach((player) => batch.update(playerRef(player.uid), { score: 0, words: 0, ready: false }));
  batch.update(roomRef(), { phase: "lobby", letters: [], endsAt: null, updatedAt: serverTimestamp() });
  await batch.commit();
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
ui.roomCodeInput.addEventListener("input", () => { ui.roomCodeInput.value = ui.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
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
  state.uid = user.uid;
  setConnection("online", "Çevrimiçi");
  showScreen("homeScreen");
  track("app_ready");
});

signInAnonymously(auth).catch((error) => {
  setConnection("offline", "Bağlantı hatası");
  toast(`Firebase giriş hatası: ${error.code ?? error.message}`, true);
});
