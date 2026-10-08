import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported, logEvent } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, getRedirectResult, indexedDBLocalPersistence, initializeAuth, linkWithPopup,
  linkWithRedirect, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithPopup, signInWithRedirect, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  Timestamp, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, increment, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { authErrorMessage, recoverGoogleLogin } from "./auth-flow.js";
import { appCheckSiteKey, firebaseConfig } from "./firebase-config.js";
import { findFormableWords, isLikelyStem, isValidWord, loadDictionary, normalizeWord, randomSeedWord } from "./words.js";
import {
  BOT_LEVELS, COMBO_WINDOW_MS, MAX_COMBO, botDelay, chooseBotWord, createLetterBag, createLetters,
  indexesForWord, letterPoint, pointsFor, rankTitle, refillBoard, shuffle, upperTr
} from "./game-core.js";
import {
  acceptedWord, attackFlash, celebrate, comboPop, countdownPulse, dealTiles, enterScreen, flashElement, floatText, goPulse,
  haptic, initEffects, invalidWord, isHapticsEnabled, isSoundEnabled, playSound, popIn, pressTile, purchaseFx, refillTiles,
  setHaptics, setSound, timerPulse
} from "./effects.js";

const APP_VERSION = "2.0.0";
const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
const app = initializeApp(firebaseConfig);
if (appCheckSiteKey && !isNative) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

// The default auth bundle waits for an OAuth iframe that never loads inside a
// native WebView, so the Capacitor shell uses plain IndexedDB persistence.
const auth = isNative ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
let authBusy = false;
let analytics = null;
analyticsSupported().then((supported) => { if (supported && !isNative) analytics = getAnalytics(app); }).catch(() => {});

const emulatorMode = location.hostname === "localhost" && new URLSearchParams(location.search).has("emulator");
if (emulatorMode) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
}

const $ = (id) => document.getElementById(id);
const screens = ["loadingScreen", "homeScreen", "marketScreen", "profileScreen", "lobbyScreen", "gameScreen", "resultsScreen"];
const ui = Object.fromEntries([
  "connectionBadge", "leaveButton", "playerName", "roomCodeInput", "createRoomButton", "joinRoomButton",
  "roomCodeText", "copyCodeButton", "playerCount", "lobbyPlayers", "lobbyHint", "readyButton", "startButton",
  "timerText", "timerBar", "scoreStrip", "rankText", "gameStatus", "stockText", "comboText", "comboBox", "comboMeter",
  "letterGrid", "currentWord", "wordBadge", "combatBar",
  "coinBadge", "coinText", "attackButton", "attackButtonLabel", "attackPicker", "attackTargets", "closeAttackButton", "rewardText",
  "diamondBadge", "diamondText", "profileButton", "profileAvatar", "googleLoginButton", "guestLoginButton", "logoutButton",
  "authPanel", "nativeAuthNote", "heroLine",
  "quickMatchButton", "soloButton", "profileName", "profileCode", "profileCodeButton", "profileCoins", "profileDiamonds",
  "profileRank", "profileRankBar", "profileRankNext", "profileSoloBest",
  "friendCodeInput", "addFriendButton", "friendList", "friendRequests", "friendEmpty", "profileBackButton",
  "effectsCanvas", "bottomNav", "navPlay", "navMarket", "navProfile", "marketGrid", "marketBackButton",
  "marketCoins", "marketDiamonds", "soundToggle", "hapticsToggle",
  "shuffleButton", "backspaceButton", "clearButton", "submitWordButton", "recentWords",
  "resultsEyebrow", "winnerText", "podium", "resultsList", "myWords", "myWordsList", "myWordsSummary",
  "rematchButton", "rematchStatus", "homeButton", "toast",
  "roundRecap", "recapLongest", "recapTopScore", "recapTotal", "seriesRecap", "seriesList",
  "inviteFriendButton", "invitePicker", "inviteFriendTargets", "closeInviteButton",
  "inviteBanner", "inviteText", "inviteJoinButton", "inviteDismissButton",
  "profileWins", "profileLongestWord", "profileBestWord",
  "quickMatchOverlay", "quickMatchTitle", "quickMatchTimer", "cancelQuickMatchButton", "quickMatchBotButton",
  "countdownOverlay", "countdownNumber", "countdownSubtext", "countdownTip",
  "confirmOverlay", "confirmTitle", "confirmMessage", "confirmCancelButton", "confirmOkButton",
  "rejoinBanner", "rejoinCode", "rejoinButton", "rejoinDismissButton",
  "settingsButton", "settingsSheet", "closeSettingsButton", "settingsHowToButton", "installButton", "iosInstallHint", "appVersion",
  "howToButton", "howToSheet", "closeHowToButton", "howToDoneButton",
  "soloSheet", "closeSoloButton", "soloLevels"
].map((id) => [id, $(id)]));

const dictionaryReady = loadDictionary();
// Attach a handler immediately, even before the player signs in.
dictionaryReady.catch(() => {});

const ATTACK_DURATION_MS = 8000;
const ROUND_GRACE_MS = 2000;
const COUNTDOWN_MS = 3000;
const ROUND_DURATION_MS = 75000;
const QUICK_MATCH_SCAN_MS = 4000;
const QUICK_MATCH_FRESH_MS = 30000;
const QUICK_MATCH_BOT_OFFER_MS = 12000;
const LOW_STOCK_THRESHOLD = 8;
const BOT_UID = "bot";
const MARKET_ITEMS = Object.freeze([
  { id: "a_lock", title: "A Kilidi", description: "Rakibin A taşlarını 8 sn kilitler", icon: "A", currency: "coins", price: 25, kind: "consumable" },
  { id: "aurora", title: "Aurora", description: "Canlı mor ve turkuaz taş teması", icon: "Ö", currency: "diamonds", price: 3, kind: "theme" },
  { id: "obsidian", title: "Obsidian", description: "Koyu cam ve kırmızı parıltı", icon: "Ş", currency: "diamonds", price: 5, kind: "theme" },
  { id: "royal", title: "Royal Gold", description: "Altın kenarlı premium taşlar", icon: "Ğ", currency: "diamonds", price: 8, kind: "theme" }
]);
const COUNTDOWN_TIPS = [
  "İpucu: Kutu yeşile dönerse kelime sözlükte var.",
  "İpucu: 10 saniye içinde yeni kelime bulursan seri büyür.",
  "İpucu: 7+ harfli kelimeler puanı ikiye katlar.",
  "İpucu: Seçili harfe tekrar dokunarak geri alabilirsin.",
  "İpucu: J, Ğ, F, V ve Ö en değerli harfler.",
  "İpucu: Takılınca karıştır — yeni kelimeler belirir."
];

const state = {
  uid: null,
  roomCode: null,
  room: null,
  players: [],
  selected: [],
  combo: 0,
  lastWordAt: 0,
  submitting: false,
  boardOperation: null,
  shuffling: false,
  ready: false,
  boardVersion: null,
  playerLetters: [],
  playerBag: null,
  boardInitializing: false,
  coins: 0,
  diamonds: 0,
  wins: 0,
  profile: null,
  inventory: { a_lock: 0 },
  ownedThemes: ["default"],
  activeTheme: "default",
  friendships: [],
  quickMatching: false,
  quickMatchBusy: false,
  quickMatchScan: null,
  quickMatchStartedAt: 0,
  quickStarting: false,
  matchmakingUnsubscriber: null,
  effects: [],
  submissions: [],
  submissionOrder: new Map(),
  blockedActive: false,
  rewarding: false,
  finishing: false,
  celebratedRound: null,
  activeRoundKey: null,
  lastTimerSecond: null,
  profileUnsubscriber: null,
  friendsUnsubscriber: null,
  inviteUnsubscriber: null,
  pendingInvite: null,
  roundHistory: [],
  roundHistoryRecorded: null,
  quickMatchTimerInterval: null,
  countdownRound: null,
  countdownTimer: null,
  lastCountdownSecond: null,
  goTimer: null,
  screenGuardTimer: null,
  currentScreen: "loadingScreen",
  local: null,
  wakeLock: null,
  installPrompt: null,
  unsubscribers: [],
  timer: null,
  heartbeat: null,
  toastTimer: null
};

function inMatch() { return Boolean(state.roomCode || state.local); }
// Offline matches work signed out, so "me" is not always a Firebase uid.
function myUid() { return state.local ? state.localUid : state.uid; }

function showScreen(id) {
  state.currentScreen = id;
  document.body.classList.toggle("in-game", id === "gameScreen");
  for (const screen of screens) $(screen).classList.toggle("active", screen === id);
  ui.leaveButton.classList.toggle("hidden", !inMatch() || !["lobbyScreen", "gameScreen", "resultsScreen"].includes(id));
  const socialScreen = ["homeScreen", "marketScreen", "profileScreen"].includes(id);
  ui.bottomNav.classList.toggle("hidden", !socialScreen || !state.uid);
  ui.settingsButton.classList.toggle("hidden", !socialScreen && id !== "loadingScreen");
  ui.navPlay.classList.toggle("active", id === "homeScreen");
  ui.navMarket.classList.toggle("active", id === "marketScreen");
  ui.navProfile.classList.toggle("active", id === "profileScreen");
  const target = $(id);
  target.classList.add("screen-guard");
  clearTimeout(state.screenGuardTimer);
  state.screenGuardTimer = setTimeout(() => target.classList.remove("screen-guard"), 380);
  enterScreen(target);
  if (id === "marketScreen") renderMarket();
  if (id === "profileScreen") renderSoloBests();
  syncWakeLock();
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

function showConfirm(message, okLabel = "Çık", title = "OYUNDAN ÇIK") {
  return new Promise((resolve) => {
    ui.confirmTitle.textContent = title;
    ui.confirmMessage.textContent = message;
    ui.confirmOkButton.textContent = okLabel;
    ui.confirmOverlay.classList.remove("hidden");
    const onOk = () => settle(true);
    const onCancel = () => settle(false);
    function settle(result) {
      ui.confirmOverlay.classList.add("hidden");
      ui.confirmOkButton.removeEventListener("click", onOk);
      ui.confirmCancelButton.removeEventListener("click", onCancel);
      state.confirmCancel = null;
      resolve(result);
    }
    state.confirmCancel = onCancel;
    ui.confirmOkButton.addEventListener("click", onOk);
    ui.confirmCancelButton.addEventListener("click", onCancel);
  });
}

const SHEETS = () => [ui.attackPicker, ui.invitePicker, ui.soloSheet, ui.settingsSheet, ui.howToSheet];

function openSheet(sheet) {
  sheet.classList.remove("hidden");
  popIn(sheet.querySelector(".sheet"));
  haptic("tap");
}
function closeSheet(sheet) { sheet.classList.add("hidden"); }

// Closes the top-most overlay; returns true when something was closed.
function closeTopOverlay() {
  if (!ui.confirmOverlay.classList.contains("hidden")) { state.confirmCancel?.(); return true; }
  const open = SHEETS().filter((sheet) => !sheet.classList.contains("hidden"));
  if (open.length) { open.forEach(closeSheet); return true; }
  return false;
}

function track(name, params = {}) {
  if (analytics) logEvent(analytics, name, params);
}

function readStore(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage can be blocked in private mode */ }
}

function friendCodeFor(uid) {
  return uid.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLocaleUpperCase("tr-TR");
}

function authDisplayName(user = auth.currentUser) {
  return user?.displayName || `Misafir ${(user?.uid ?? "PLAY").slice(0, 4).toLocaleUpperCase("tr-TR")}`;
}

async function ensureProfile(user = auth.currentUser) {
  const friendCode = friendCodeFor(user.uid);
  const displayName = authDisplayName(user);
  await runTransaction(db, async (transaction) => {
    const ref = profileRef();
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      transaction.set(ref, {
        coins: 0, diamonds: 0, wins: 0, inventory: { a_lock: 0 },
        ownedThemes: ["default"], activeTheme: "default", lastAction: null, friendCode,
        displayName, photoURL: user.photoURL ?? "",
        longestWord: "", bestScore: 0, bestScoreWord: "",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    } else {
      transaction.update(ref, {
        displayName: user.displayName ?? snapshot.data().displayName ?? displayName,
        photoURL: user.photoURL ?? snapshot.data().photoURL ?? "",
        friendCode: snapshot.data().friendCode ?? friendCode,
        diamonds: snapshot.data().diamonds ?? 0,
        wins: snapshot.data().wins ?? 0,
        inventory: snapshot.data().inventory ?? { a_lock: 0 },
        ownedThemes: snapshot.data().ownedThemes ?? ["default"],
        activeTheme: snapshot.data().activeTheme ?? "default",
        updatedAt: serverTimestamp()
      });
    }
  });
  await setDoc(doc(db, "handles", friendCode), {
    uid: user.uid,
    displayName,
    photoURL: user.photoURL ?? "",
    updatedAt: serverTimestamp()
  }, { merge: true });
  state.profileUnsubscriber?.();
  state.profileUnsubscriber = onSnapshot(profileRef(), (snapshot) => {
    state.profile = snapshot.data() ?? null;
    state.coins = state.profile?.coins ?? 0;
    state.diamonds = state.profile?.diamonds ?? 0;
    state.wins = state.profile?.wins ?? 0;
    state.inventory = state.profile?.inventory ?? { a_lock: 0 };
    state.ownedThemes = state.profile?.ownedThemes ?? ["default"];
    state.activeTheme = state.profile?.activeTheme ?? "default";
    applyTheme(state.activeTheme);
    ui.coinText.textContent = state.coins;
    ui.diamondText.textContent = state.diamonds;
    ui.profileName.textContent = state.profile?.displayName ?? "Oyuncu";
    ui.profileCode.textContent = state.profile?.friendCode ?? friendCode;
    ui.profileCoins.textContent = state.coins;
    ui.profileDiamonds.textContent = state.diamonds;
    ui.profileWins.textContent = state.wins;
    const rank = rankTitle(state.wins);
    ui.profileRank.textContent = `${rank.title} · Seviye ${rank.level}`;
    ui.profileRankBar.style.transform = `scaleX(${Math.max(.04, rank.progress)})`;
    ui.profileRankNext.textContent = rank.next ? `${rank.next} için ${rank.nextAt - state.wins} galibiyet daha` : "En yüksek rütbedesin!";
    ui.profileLongestWord.textContent = state.profile?.longestWord
      ? upperTr(state.profile.longestWord)
      : "–";
    ui.profileBestWord.textContent = state.profile?.bestScoreWord
      ? `${upperTr(state.profile.bestScoreWord)} · +${state.profile.bestScore ?? 0}`
      : "–";
    ui.marketCoins.textContent = state.coins;
    ui.marketDiamonds.textContent = state.diamonds;
    ui.profileAvatar.src = state.profile?.photoURL || avatarDataUrl(state.profile?.displayName ?? "W");
    ui.coinBadge.classList.remove("hidden");
    ui.diamondBadge.classList.remove("hidden");
    ui.profileButton.classList.remove("hidden");
    renderAttackButton();
    renderMarket();
  });
  subscribeFriendships();
  subscribeInvite();
}

function avatarDataUrl(name) {
  const letter = encodeURIComponent(initials(name));
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' rx='40' fill='%23FFB238'/%3E%3Ctext x='40' y='53' text-anchor='middle' fill='%232A1B02' font-family='Arial' font-weight='900' font-size='34'%3E${letter}%3C/text%3E%3C/svg%3E`;
}

function applyTheme(theme) {
  if (theme && theme !== "default") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function friendshipId(uidA, uidB) { return [uidA, uidB].sort().join("_"); }

function subscribeFriendships() {
  state.friendsUnsubscriber?.();
  state.friendsUnsubscriber = onSnapshot(
    query(collection(db, "friendships"), where("members", "array-contains", state.uid)),
    (snapshot) => {
      state.friendships = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderFriends();
    }
  );
}

function friendIdentity(friendship) {
  return friendship.people?.find((person) => person.uid !== state.uid) ?? { name: "Oyuncu", photoURL: "" };
}

function avatarElement(name, seed, className = "mini-avatar") {
  const avatar = document.createElement("span");
  avatar.className = className;
  avatar.textContent = initials(name);
  avatar.style.setProperty("--h", `${avatarHue(seed)}deg`);
  return avatar;
}

function renderFriends() {
  const accepted = state.friendships.filter((item) => item.status === "accepted");
  const requests = state.friendships.filter((item) => item.status === "pending" && item.requestedBy !== state.uid);
  const outgoing = state.friendships.filter((item) => item.status === "pending" && item.requestedBy === state.uid);
  ui.friendEmpty.classList.toggle("hidden", accepted.length + requests.length + outgoing.length > 0);
  ui.friendList.replaceChildren(...accepted.map((item) => {
    const person = friendIdentity(item);
    const row = document.createElement("div");
    row.className = "friend-row";
    const name = document.createElement("strong");
    name.textContent = person.name;
    row.append(avatarElement(person.name, person.uid), name);
    return row;
  }), ...outgoing.map((item) => {
    const person = friendIdentity(item);
    const row = document.createElement("div");
    row.className = "friend-row pending";
    const name = document.createElement("strong");
    name.textContent = person.name;
    const label = document.createElement("small");
    label.textContent = "İSTEK GÖNDERİLDİ";
    row.append(avatarElement(person.name, person.uid), name, label);
    return row;
  }));
  ui.friendRequests.replaceChildren(...requests.map((item) => {
    const person = friendIdentity(item);
    const row = document.createElement("div");
    row.className = "friend-row request";
    const name = document.createElement("strong");
    name.textContent = person.name;
    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "KABUL";
    accept.addEventListener("click", () => acceptFriend(item.id));
    row.append(avatarElement(person.name, person.uid), name, accept);
    return row;
  }));
}

async function addFriend() {
  try {
    const code = ui.friendCodeInput.value.replace(/[^a-z0-9]/gi, "").toLocaleUpperCase("tr-TR");
    if (code.length < 6) throw new Error("Arkadaş kodunu gir.");
    const handle = await getDoc(doc(db, "handles", code));
    if (!handle.exists() || handle.data().uid === state.uid) throw new Error("Oyuncu bulunamadı.");
    const target = handle.data();
    const ref = doc(db, "friendships", friendshipId(state.uid, target.uid));
    if (state.friendships.some((item) => item.id === ref.id)) throw new Error("Arkadaşlık isteği zaten var.");
    await setDoc(ref, {
      members: [state.uid, target.uid].sort(),
      requestedBy: state.uid,
      status: "pending",
      people: [
        { uid: state.uid, name: state.profile?.displayName ?? "Oyuncu", photoURL: state.profile?.photoURL ?? "" },
        { uid: target.uid, name: target.displayName ?? "Oyuncu", photoURL: target.photoURL ?? "" }
      ],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    ui.friendCodeInput.value = "";
    toast("Arkadaşlık isteği gönderildi.");
  } catch (error) { toast(error.message, true); }
}

async function acceptFriend(id) {
  try {
    await updateDoc(doc(db, "friendships", id), { status: "accepted", updatedAt: serverTimestamp() });
    toast("Arkadaş eklendi.");
    haptic("accept");
  } catch (error) { toast("İstek kabul edilemedi.", true); }
}

function subscribeInvite() {
  state.inviteUnsubscriber?.();
  state.inviteUnsubscriber = onSnapshot(doc(db, "invites", state.uid), (snapshot) => {
    const invite = snapshot.data();
    if (!invite) { hideInviteBanner(); return; }
    showInviteBanner(invite);
  });
}

function showInviteBanner(invite) {
  state.pendingInvite = invite;
  ui.inviteText.textContent = `${invite.fromName ?? "Bir arkadaşın"} seni bir odaya davet etti.`;
  ui.inviteBanner.classList.remove("hidden");
  playSound("opponent");
  haptic("accept");
}

function hideInviteBanner() {
  state.pendingInvite = null;
  ui.inviteBanner.classList.add("hidden");
}

async function acceptInvite() {
  const invite = state.pendingInvite;
  if (!invite) return;
  hideInviteBanner();
  await deleteDoc(doc(db, "invites", state.uid)).catch(() => {});
  try {
    if (state.local) stopLocalMatch();
    if (state.roomCode && state.roomCode !== invite.roomCode) await leaveRoom();
    await joinRoomByCode(invite.roomCode);
    track("invite_accept");
  } catch (error) { toast(error.message, true); }
}

function dismissInvite() {
  hideInviteBanner();
  deleteDoc(doc(db, "invites", state.uid)).catch(() => {});
}

function openInvitePicker() {
  if (!state.roomCode) return;
  const accepted = state.friendships.filter((item) => item.status === "accepted");
  if (!accepted.length) { toast("Önce profilinden arkadaş eklemelisin.", true); return; }
  ui.inviteFriendTargets.replaceChildren(...accepted.map((item) => {
    const person = friendIdentity(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attack-target";
    const name = document.createElement("span");
    name.textContent = person.name;
    button.append(avatarElement(person.name, person.uid), name);
    button.addEventListener("click", () => sendRoomInvite(person));
    return button;
  }));
  openSheet(ui.invitePicker);
}

async function sendRoomInvite(person) {
  if (!state.roomCode || !person.uid) return;
  try {
    await setDoc(doc(db, "invites", person.uid), {
      fromUid: state.uid,
      fromName: state.profile?.displayName ?? "Oyuncu",
      roomCode: state.roomCode,
      createdAt: serverTimestamp()
    });
    closeSheet(ui.invitePicker);
    toast(`${person.name} davet edildi.`);
  } catch (error) { toast(error.message, true); }
}

function currencyIcon(currency) {
  return `<svg class="ic"><use href="#${currency === "coins" ? "i-coin" : "i-gem"}"/></svg>`;
}

function renderMarket() {
  if (!ui.marketGrid) return;
  ui.marketCoins.textContent = state.coins;
  ui.marketDiamonds.textContent = state.diamonds;
  ui.marketGrid.replaceChildren(...MARKET_ITEMS.map((item) => {
    const card = document.createElement("article");
    card.className = `market-card ${item.kind}`;
    card.dataset.item = item.id;
    const owned = item.kind === "theme" && state.ownedThemes.includes(item.id);
    const equipped = item.kind === "theme" && state.activeTheme === item.id;
    const amount = item.kind === "consumable" ? (state.inventory[item.id] ?? 0) : 0;
    card.innerHTML = `<div class="market-icon"><span class="theme-tile"></span></div><div class="market-copy"><strong></strong><span></span></div><div class="market-owned"></div><button type="button"></button>`;
    const icon = card.querySelector(".market-icon");
    icon.dataset.preview = item.kind === "theme" ? item.id : "lock";
    icon.querySelector(".theme-tile").textContent = item.icon;
    card.querySelector(".market-copy strong").textContent = item.title;
    card.querySelector(".market-copy span").textContent = item.description;
    card.querySelector(".market-owned").textContent = item.kind === "consumable" ? `STOK x${amount}` : (equipped ? "KUŞANILDI" : (owned ? "SAHİP" : ""));
    const button = card.querySelector("button");
    if (equipped) {
      button.textContent = "AKTİF";
      button.disabled = true;
    } else if (owned) {
      button.textContent = "KUŞAN";
      button.addEventListener("click", () => equipTheme(item, card));
    } else {
      const balance = item.currency === "coins" ? state.coins : state.diamonds;
      const missing = Math.max(0, item.price - balance);
      button.innerHTML = `${currencyIcon(item.currency)}<span></span>`;
      button.querySelector("span").textContent = missing ? `${missing} eksik` : String(item.price);
      button.classList.toggle("short", missing > 0);
      button.disabled = missing > 0 || !state.uid;
      button.addEventListener("click", () => buyMarketItem(item, card));
    }
    return card;
  }), ...(state.activeTheme !== "default" ? [defaultThemeCard()] : []));
}

function defaultThemeCard() {
  const card = document.createElement("article");
  card.className = "market-card theme";
  card.innerHTML = `<div class="market-icon" data-preview="default"><span class="theme-tile">K</span></div><div class="market-copy"><strong>Klasik</strong><span>Varsayılan krem taşlar</span></div><div class="market-owned">SAHİP</div><button type="button">KUŞAN</button>`;
  card.querySelector("button").addEventListener("click", () => equipTheme({ id: "default" }, card));
  return card;
}

async function buyMarketItem(item, card) {
  try {
    await runTransaction(db, async (transaction) => {
      const profile = await transaction.get(profileRef());
      if (!profile.exists()) throw new Error("Profil bulunamadı.");
      const data = profile.data();
      const balance = item.currency === "coins" ? (data.coins ?? 0) : (data.diamonds ?? 0);
      if (balance < item.price) throw new Error("Yetersiz bakiye.");
      const update = {
        lastAction: { type: "market", itemId: item.id, currency: item.currency, price: item.price },
        updatedAt: serverTimestamp()
      };
      if (item.currency === "coins") update.coins = increment(-item.price);
      else update.diamonds = increment(-item.price);
      if (item.kind === "consumable") {
        update.inventory = { ...(data.inventory ?? { a_lock: 0 }), [item.id]: (data.inventory?.[item.id] ?? 0) + 1 };
      } else {
        if ((data.ownedThemes ?? ["default"]).includes(item.id)) throw new Error("Bu tema zaten sende.");
        update.ownedThemes = [...(data.ownedThemes ?? ["default"]), item.id];
      }
      transaction.update(profileRef(), update);
    });
    purchaseFx(card.isConnected ? card : ui.marketGrid, item.currency);
    toast(`${item.title} satın alındı.`);
  } catch (error) { toast(error.message, true); }
}

async function equipTheme(item, card) {
  try {
    await updateDoc(profileRef(), { activeTheme: item.id, updatedAt: serverTimestamp() });
    applyTheme(item.id);
    purchaseFx(card.isConnected ? card : ui.marketGrid, "diamonds");
  } catch (error) { toast("Tema değiştirilemedi.", true); }
}

function openQuickMatchOverlay() {
  ui.quickMatchOverlay.classList.remove("hidden");
  ui.quickMatchTitle.textContent = "RAKİP ARANIYOR";
  ui.quickMatchBotButton.classList.add("hidden");
  clearInterval(state.quickMatchTimerInterval);
  state.quickMatchStartedAt = Date.now();
  const tick = () => {
    const elapsedMs = Date.now() - state.quickMatchStartedAt;
    ui.quickMatchTimer.textContent = `${Math.floor(elapsedMs / 1000)} sn`;
    if (elapsedMs >= QUICK_MATCH_BOT_OFFER_MS) ui.quickMatchBotButton.classList.remove("hidden");
  };
  tick();
  state.quickMatchTimerInterval = setInterval(tick, 1000);
}

function closeQuickMatchOverlay() {
  clearInterval(state.quickMatchTimerInterval);
  state.quickMatchTimerInterval = null;
  ui.quickMatchOverlay.classList.add("hidden");
}

function setQuickMatchUi(active, statusText = "") {
  state.quickMatching = active;
  if (active) openQuickMatchOverlay();
  else {
    closeQuickMatchOverlay();
    clearInterval(state.quickMatchScan);
    state.quickMatchScan = null;
  }
  if (statusText) ui.quickMatchTitle.textContent = statusText;
}

async function joinQuickRoom(code) {
  if (state.roomCode === code) return;
  const room = await getDoc(roomRef(code));
  if (!room.exists()) throw new Error("Eşleşme odası bulunamadı.");
  await setDoc(playerRef(state.uid, code), {
    name: playerDisplayName(), score: 0, words: 0, round: room.data().round ?? 0, letters: [], letterBag: [],
    boardVersion: 0, boardRound: -1, attackUsedRound: -1, rewardedRound: -1,
    ready: true, connected: true, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp()
  }, { merge: true });
  state.matchmakingUnsubscriber?.();
  state.matchmakingUnsubscriber = null;
  setQuickMatchUi(false, "");
  await deleteDoc(doc(db, "matchmaking", state.uid)).catch(() => {});
  haptic("accept");
  await enterRoom(code);
}

function watchMatchmaking() {
  state.matchmakingUnsubscriber?.();
  state.matchmakingUnsubscriber = onSnapshot(doc(db, "matchmaking", state.uid), async (snapshot) => {
    const data = snapshot.data();
    if (data?.status !== "matched" || !data.roomCode || !state.quickMatching) return;
    try { await joinQuickRoom(data.roomCode); }
    catch (error) { toast(error.message, true); setQuickMatchUi(false, ""); }
  });
}

async function cancelQuickMatch() {
  if (!state.quickMatching) return;
  setQuickMatchUi(false, "");
  state.matchmakingUnsubscriber?.();
  state.matchmakingUnsubscriber = null;
  await deleteDoc(doc(db, "matchmaking", state.uid)).catch(() => {});
}

// Keeps our queue entry fresh and periodically tries to pair with someone.
async function scanForOpponent() {
  if (!state.quickMatching || state.quickMatchBusy || state.roomCode) return;
  state.quickMatchBusy = true;
  const ownQueueRef = doc(db, "matchmaking", state.uid);
  try {
    await updateDoc(ownQueueRef, { updatedAt: serverTimestamp() }).catch(() => {});
    const waiting = await getDocs(query(collection(db, "matchmaking"), where("status", "==", "waiting"), limit(10)));
    if (!state.quickMatching) return;
    const candidate = waiting.docs.find((item) =>
      item.id !== state.uid && (item.data().updatedAt?.toMillis?.() ?? 0) > Date.now() - QUICK_MATCH_FRESH_MS
    );
    if (!candidate) return;
    const code = randomCode();
    const candidateRef = doc(db, "matchmaking", candidate.id);
    const roomDocument = roomRef(code);
    await runTransaction(db, async (transaction) => {
      const ownSnapshot = await transaction.get(ownQueueRef);
      const candidateSnapshot = await transaction.get(candidateRef);
      const roomSnapshot = await transaction.get(roomDocument);
      if (!ownSnapshot.exists() || ownSnapshot.data().status !== "waiting") throw new Error("Zaten eşleştin.");
      if (!candidateSnapshot.exists() || candidateSnapshot.data().status !== "waiting") throw new Error("Rakip başka bir maça katıldı.");
      if (roomSnapshot.exists()) throw new Error("Eşleşme kodu çakıştı. Tekrar dene.");
      transaction.set(roomDocument, {
        hostId: state.uid, phase: "lobby", round: 0, boardVersion: 0, maxPlayers: 2,
        quickMatch: true, letters: [], endsAt: null, winnerId: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      transaction.set(playerRef(state.uid, code), {
        name: playerDisplayName(), score: 0, words: 0, round: 0,
        letters: [], letterBag: [], boardVersion: 0, boardRound: -1,
        attackUsedRound: -1, rewardedRound: -1, ready: true, connected: true,
        joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp()
      });
      transaction.update(candidateRef, { status: "matched", roomCode: code, matchedBy: state.uid, updatedAt: serverTimestamp() });
      transaction.update(ownQueueRef, { status: "matched", roomCode: code, matchedBy: state.uid, updatedAt: serverTimestamp() });
    });
    await joinQuickRoom(code);
  } catch (error) {
    // Lost races are expected; the next scan or our own listener takes over.
    if (!/başka bir maça|kodu çakıştı|Zaten eşleştin/.test(error.message ?? "")) {
      setQuickMatchUi(false, "");
      toast(error.message || "Eşleşme başarısız oldu.", true);
    }
  } finally {
    state.quickMatchBusy = false;
  }
}

async function quickMatch() {
  if (state.quickMatching || !state.uid) return;
  try {
    setQuickMatchUi(true);
    await setDoc(doc(db, "matchmaking", state.uid), {
      uid: state.uid,
      name: playerDisplayName(),
      photoURL: state.profile?.photoURL ?? "",
      status: "waiting",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    watchMatchmaking();
    track("quick_match_search");
    await scanForOpponent();
    if (state.quickMatching && !state.quickMatchScan) state.quickMatchScan = setInterval(scanForOpponent, QUICK_MATCH_SCAN_MS);
  } catch (error) {
    setQuickMatchUi(false, "");
    toast(error.message, true);
  }
}

async function quickMatchToBot() {
  await cancelQuickMatch();
  startSolo("medium");
}

function playerDisplayName() {
  const typed = ui.playerName.value.trim().replace(/\s+/g, " ");
  if (typed.length >= 2) return typed.slice(0, 18);
  return state.profile?.displayName ?? auth.currentUser?.displayName ?? "Oyuncu";
}

function cleanName() {
  const value = ui.playerName.value.trim().replace(/\s+/g, " ");
  if (value.length < 2) { ui.playerName.focus(); throw new Error("Oyuncu adı en az 2 karakter olmalı."); }
  writeStore("wra-player-name", value);
  return value;
}

function cleanCode() {
  const value = ui.roomCodeInput.value.replace(/\D/g, "").slice(0, 5);
  if (value.length !== 5) throw new Error("5 haneli oda kodunu gir.");
  return value;
}

function roomRef(code = state.roomCode) { return doc(db, "rooms", code); }
function playerRef(uid = state.uid, code = state.roomCode) { return doc(db, "rooms", code, "players", uid); }
function profileRef(uid = state.uid) { return doc(db, "profiles", uid); }

function randomCode() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

async function createRoom() {
  if (!state.uid) { toast("Oda kurmak için önce giriş yap.", true); return; }
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
          hostId: state.uid, phase: "lobby", round: 0, boardVersion: 0, maxPlayers: 4, letters: [], endsAt: null, winnerId: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        transaction.set(playerRef(state.uid, candidate), {
          name, score: 0, words: 0, round: 0, letters: [], letterBag: [], boardVersion: 0, boardRound: -1,
          attackUsedRound: -1, rewardedRound: -1, ready: false, connected: true,
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

async function joinRoomByCode(code) {
  const name = cleanName();
  const ref = roomRef(code);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Oda bulunamadı.");
  if (snapshot.data().phase !== "lobby") throw new Error("Bu odada maç başlamış.");
  const playerSnapshots = await getDocs(query(collection(ref, "players"), limit(5)));
  if (playerSnapshots.size >= 4 && !playerSnapshots.docs.some((item) => item.id === state.uid)) throw new Error("Oda dolu.");
  await setDoc(playerRef(state.uid, code), {
    name, score: 0, words: 0, round: snapshot.data().round ?? 0, letters: [], letterBag: [], boardVersion: 0, boardRound: -1,
    attackUsedRound: -1, rewardedRound: -1, ready: false, connected: true,
    joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp()
  }, { merge: true });
  await enterRoom(code);
}

async function joinRoom() {
  if (!state.uid) { toast("Odaya katılmak için önce giriş yap.", true); return; }
  try {
    setBusy(true);
    const code = cleanCode();
    await joinRoomByCode(code);
    ui.roomCodeInput.value = "";
    track("room_join");
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

function persistRoomCode(code) {
  writeStore("wra-room-code", code || null);
}

async function resumeRoom(code) {
  try {
    const [roomSnapshot, playerSnapshot] = await Promise.all([getDoc(roomRef(code)), getDoc(playerRef(state.uid, code))]);
    if (!roomSnapshot.exists() || !playerSnapshot.exists()) { persistRoomCode(null); return false; }
    await updateDoc(playerRef(state.uid, code), { connected: true, lastSeenAt: serverTimestamp() });
    await enterRoom(code);
    return true;
  } catch (error) {
    persistRoomCode(null);
    return false;
  }
}

function resetMatchState() {
  Object.assign(state, {
    boardOperation: null, submitting: false, shuffling: false, selected: [],
    boardVersion: null, playerLetters: [], playerBag: null, boardInitializing: false,
    effects: [], submissions: [], submissionOrder: new Map(), blockedActive: false, finishing: false,
    roundHistory: [], roundHistoryRecorded: null, countdownRound: null, activeRoundKey: null,
    combo: 0, lastWordAt: 0, lastTimerSecond: null
  });
  hideCountdown();
  closeSheet(ui.attackPicker);
  ui.rewardText.textContent = "";
}

async function enterRoom(code) {
  leaveListeners();
  if (state.local) stopLocalMatch();
  persistRoomCode(code);
  state.roomCode = code;
  state.room = null;
  state.players = [];
  resetMatchState();
  ui.roomCodeText.replaceChildren(...[...code].map((digit) => {
    const tile = document.createElement("span");
    tile.className = "tile tile--code";
    tile.textContent = digit;
    return tile;
  }));
  state.unsubscribers.push(onSnapshot(roomRef(), (snapshot) => {
    if (!snapshot.exists()) { toast("Oda kapatıldı.", true); leaveRoom(); return; }
    const nextRoom = snapshot.data();
    if (state.room && (nextRoom.round !== state.room.round || nextRoom.phase !== state.room.phase)) {
      state.boardOperation = null;
      state.submitting = false;
      state.shuffling = false;
      state.selected = [];
    }
    state.room = nextRoom;
    routeRoomPhase();
  }, () => toast("Oda verisi okunamadı.", true)));
  state.unsubscribers.push(onSnapshot(query(collection(roomRef(), "players"), orderBy("score", "desc")), (snapshot) => {
    state.players = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
    const me = state.players.find((player) => player.uid === state.uid);
    state.ready = Boolean(me?.ready) && me?.round === (state.room?.round ?? 0);
    if (!state.submitting && !state.shuffling) {
      const nextBoardVersion = me?.boardVersion ?? 0;
      if (state.boardVersion !== null && nextBoardVersion !== state.boardVersion) state.selected = [];
      state.boardVersion = nextBoardVersion;
      state.playerLetters = me?.boardRound === (state.room?.round ?? 0) ? (me?.letters ?? []) : [];
      state.playerBag = me?.boardRound === (state.room?.round ?? 0) && Array.isArray(me?.letterBag) ? me.letterBag : null;
    }
    renderPlayers();
    renderScores();
    renderStock();
    renderAttackButton();
    renderResults();
    if (state.room?.phase === "playing") { ensurePlayerBoard(); renderLetters(); }
    maybeStartQuickMatch();
    maybeClaimHost();
  }));
  state.unsubscribers.push(onSnapshot(collection(roomRef(), "effects"), (snapshot) => {
    state.effects = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    refreshBlockedLetters(true);
  }));
  state.unsubscribers.push(onSnapshot(query(collection(roomRef(), "rounds"), orderBy("round")), (snapshot) => {
    state.roundHistory = snapshot.docs.map((item) => item.data());
    renderResults();
  }));
  let firstSubmissions = true;
  state.unsubscribers.push(onSnapshot(collection(roomRef(), "submissions"), (snapshot) => {
    const fresh = [];
    for (const change of snapshot.docChanges()) {
      if (change.type === "added" && !firstSubmissions) fresh.push({ id: change.doc.id, ...change.doc.data() });
    }
    firstSubmissions = false;
    state.submissions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    for (const submission of state.submissions) {
      if (!state.submissionOrder.has(submission.id)) state.submissionOrder.set(submission.id, state.submissionOrder.size);
    }
    for (const submission of fresh) {
      if (submission.ownerId !== state.uid && submission.round === (state.room?.round ?? 0)) onOpponentWord(submission);
    }
    renderFoundWords();
    renderCurrentWord();
    renderResults();
  }, () => {}));
  clearInterval(state.heartbeat);
  updateDoc(playerRef(), { connected: true, lastSeenAt: serverTimestamp() }).catch(() => {});
  state.heartbeat = setInterval(() => updateDoc(playerRef(), { connected: true, lastSeenAt: serverTimestamp() }).catch(() => {}), 20000);
}

async function maybeClaimHost() {
  if (!state.room || state.room.hostId === state.uid || !state.players.length) return;
  const host = state.players.find((player) => player.uid === state.room.hostId);
  if (!host || host.connected !== false) return;
  const candidates = state.players
    .filter((player) => player.connected)
    .sort((a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0));
  if (!candidates.length || candidates[0].uid !== state.uid) return;
  try { await updateDoc(roomRef(), { hostId: state.uid, updatedAt: serverTimestamp() }); }
  catch (error) { /* another connected player likely claimed host first */ }
}

function roundKey() {
  return `${state.local ? "solo" : state.roomCode}:${state.room?.round ?? 0}`;
}

// Per-round client state must reset for every player, not only the host.
function beginRoundIfNeeded() {
  const key = roundKey();
  if (state.activeRoundKey === key) return;
  state.activeRoundKey = key;
  state.combo = 0;
  state.lastWordAt = 0;
  state.selected = [];
  state.lastTimerSecond = null;
  state.blockedActive = false;
  ui.rewardText.textContent = "";
  ui.comboText.textContent = "";
  ui.gameStatus.textContent = "Harfleri seç";
  document.body.classList.remove("hurry", "lost");
  renderFoundWords();
}

function routeRoomPhase() {
  if (!state.room) return;
  if (state.room.phase === "lobby") {
    if (state.currentScreen !== "lobbyScreen") showScreen("lobbyScreen");
    syncMyRound();
    renderPlayers();
    state.countdownRound = null;
    hideCountdown();
  } else if (state.room.phase === "playing") {
    beginRoundIfNeeded();
    if (state.currentScreen !== "gameScreen") showScreen("gameScreen");
    ensurePlayerBoard();
    renderLetters();
    renderScores();
    renderAttackButton();
    startTimer();
    startCountdownIfNeeded();
  } else if (state.room.phase === "results") {
    clearInterval(state.timer);
    hideCountdown();
    document.body.classList.remove("hurry");
    if (state.currentScreen !== "resultsScreen") showScreen("resultsScreen");
    renderResults();
    if (state.local) celebrateLocalRound();
    else {
      awardRound();
      recordRoundHistory();
    }
  }
}

function isCountdownActive() {
  const startsAt = state.room?.startsAt?.toMillis?.() ?? 0;
  return startsAt > Date.now();
}

function startCountdownIfNeeded() {
  const round = roundKey();
  if (!isCountdownActive()) { hideCountdown(); return; }
  if (state.countdownRound === round) return;
  state.countdownRound = round;
  showCountdown();
}

function showCountdown() {
  ui.countdownOverlay.classList.remove("hidden", "go");
  ui.countdownSubtext.textContent = state.local ? `${state.local.level.name.toLocaleUpperCase("tr-TR")} HAZIR` : "HAZIR OL";
  ui.countdownTip.textContent = COUNTDOWN_TIPS[Math.floor(Math.random() * COUNTDOWN_TIPS.length)];
  ui.letterGrid.classList.add("countdown-hide");
  clearInterval(state.countdownTimer);
  clearTimeout(state.goTimer);
  state.lastCountdownSecond = null;
  const tick = () => {
    const startsAt = state.room?.startsAt?.toMillis?.() ?? 0;
    const msLeft = startsAt - Date.now();
    if (msLeft <= 0) { showGo(); return; }
    const secondsLeft = Math.ceil(msLeft / 1000);
    if (secondsLeft !== state.lastCountdownSecond) {
      state.lastCountdownSecond = secondsLeft;
      ui.countdownNumber.textContent = secondsLeft;
      countdownPulse(ui.countdownNumber);
      haptic("tap");
    }
  };
  tick();
  state.countdownTimer = setInterval(tick, 100);
}

function showGo() {
  clearInterval(state.countdownTimer);
  state.countdownTimer = null;
  ui.countdownOverlay.classList.add("go");
  ui.countdownNumber.textContent = "BAŞLA!";
  ui.countdownSubtext.textContent = "";
  ui.letterGrid.classList.remove("countdown-hide");
  goPulse(ui.countdownNumber);
  renderLetters();
  requestAnimationFrame(() => dealTiles([...ui.letterGrid.children]));
  clearTimeout(state.goTimer);
  state.goTimer = setTimeout(hideCountdown, 650);
}

function hideCountdown() {
  clearInterval(state.countdownTimer);
  clearTimeout(state.goTimer);
  state.countdownTimer = null;
  ui.countdownOverlay.classList.add("hidden");
  ui.countdownOverlay.classList.remove("go");
  ui.letterGrid.classList.remove("countdown-hide");
}

function roundSubmissions(round = state.room?.round ?? 0) {
  return state.submissions
    .filter((item) => item.round === round)
    .sort((a, b) => (state.submissionOrder.get(a.id) ?? 0) - (state.submissionOrder.get(b.id) ?? 0));
}

function roundRecap() {
  const items = roundSubmissions();
  let longest = null;
  let topScore = null;
  for (const data of items) {
    if (!longest || [...data.word].length > [...longest.word].length) longest = data;
    if (!topScore || data.points > topScore.points) topScore = data;
  }
  return { longest, topScore, total: items.length };
}

async function recordRoundHistory() {
  if (state.room?.hostId !== state.uid || !state.roomCode) return;
  const round = state.room?.round ?? 0;
  if (state.roundHistoryRecorded === round) return;
  state.roundHistoryRecorded = round;
  const sorted = state.players.map(currentRoundPlayer).sort((a, b) => b.score - a.score);
  try {
    await setDoc(doc(roomRef(), "rounds", String(round)), {
      round,
      winnerId: state.room?.winnerId ?? null,
      players: sorted.map((player) => ({ uid: player.uid, name: player.name, score: player.score ?? 0 })),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    state.roundHistoryRecorded = null;
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
  if (state.local) return;
  ui.playerCount.textContent = `${state.players.length} / ${state.room?.maxPlayers ?? 4}`;
  const players = state.players.map(currentRoundPlayer);
  const slots = Math.max(0, (state.room?.maxPlayers ?? 4) - players.length);
  ui.lobbyPlayers.replaceChildren(...players.map((player) => {
    const card = document.createElement("div");
    card.className = `player-card${player.uid === state.uid ? " me" : ""}`;
    card.innerHTML = `<div class="avatar"></div><div class="player-meta"><strong></strong><span></span></div><div class="ready-mark"></div>`;
    const avatar = card.querySelector(".avatar");
    avatar.textContent = initials(player.name);
    avatar.style.setProperty("--h", `${avatarHue(player.uid)}deg`);
    card.querySelector("strong").textContent = player.uid === state.uid ? `${player.name} (sen)` : player.name;
    card.querySelector("span").textContent = player.uid === state.room?.hostId ? "Oda sahibi" : (player.connected ? "Bağlı" : "Bağlantı koptu");
    const mark = card.querySelector(".ready-mark");
    mark.textContent = player.ready ? "HAZIR" : "BEKLİYOR";
    mark.classList.toggle("yes", Boolean(player.ready));
    return card;
  }), ...Array.from({ length: slots }, () => {
    const card = document.createElement("div");
    card.className = "player-card empty";
    card.innerHTML = `<div class="avatar"></div><div class="player-meta"><strong>Boş koltuk</strong><span>Kodu paylaş, arkadaşın katılsın</span></div>`;
    return card;
  }));
  ui.readyButton.textContent = state.ready ? "HAZIR DEĞİLİM" : "HAZIRIM";
  ui.readyButton.classList.toggle("btn--flood", !state.ready);
  ui.readyButton.classList.toggle("btn--ghost", state.ready);
  const isHost = state.room?.hostId === state.uid;
  ui.startButton.classList.toggle("hidden", !isHost);
  const readyCount = players.filter((player) => player.ready && player.connected !== false).length;
  ui.startButton.disabled = players.length < 2 || players.some((player) => !player.ready || player.connected === false);
  ui.startButton.textContent = ui.startButton.disabled ? `BAŞLAT · ${readyCount}/${players.length} HAZIR` : "MAÇI BAŞLAT";
  ui.readyButton.classList.toggle("hidden", Boolean(state.room?.quickMatch));
  ui.inviteFriendButton.classList.toggle("hidden", Boolean(state.room?.quickMatch));
  ui.lobbyHint.textContent = state.room?.quickMatch
    ? "Rakip bağlanıyor, maç birazdan başlıyor…"
    : players.length < 2
      ? "Maç için en az 2 oyuncu gerekli. Oda kodunu paylaş!"
      : isHost ? "Herkes hazır olunca maçı başlat." : "Oda sahibi maçı başlatacak.";
  ui.rematchButton.classList.toggle("hidden", !isHost);
}

function renderScores() {
  if (!state.players.length) return;
  const players = state.players.map(currentRoundPlayer).sort((a, b) => b.score - a.score);
  let shown = players.slice(0, 3);
  const meIndex = players.findIndex((player) => player.uid === myUid());
  if (meIndex >= 3) shown = [...players.slice(0, 2), players[meIndex]];
  const leader = players[0]?.score ?? 0;
  ui.scoreStrip.replaceChildren(...shown.map((player) => {
    const pill = document.createElement("div");
    const isMe = player.uid === myUid();
    pill.className = `score-pill${isMe ? " me" : ""}${player.score > 0 && player.score === leader ? " lead" : ""}`;
    pill.dataset.uid = player.uid;
    pill.innerHTML = "<span></span><strong></strong>";
    pill.querySelector("span").textContent = isMe ? "SEN" : player.name;
    pill.querySelector("strong").textContent = player.score ?? 0;
    return pill;
  }));
  ui.rankText.textContent = meIndex < 0 ? "–" : `#${meIndex + 1}`;
}

function scorePill(uid) {
  return [...ui.scoreStrip.children].find((pill) => pill.dataset.uid === uid);
}

async function ensurePlayerBoard() {
  if (state.local) return;
  const me = state.players.find((player) => player.uid === state.uid);
  const round = state.room?.round ?? 0;
  if (state.boardInitializing || !me || !(state.room?.letters?.length)) return;
  if (me.boardRound === round && Array.isArray(me.letterBag)) return;
  const letters = me.boardRound === round && me.letters?.length ? me.letters : state.room.letters;
  state.boardInitializing = true;
  try {
    await updateDoc(playerRef(), {
      letters,
      letterBag: createLetterBag(letters),
      boardRound: round,
      boardVersion: state.room.boardVersion ?? 0,
      lastSeenAt: serverTimestamp()
    });
  } catch (error) {
    toast("Harf stoğu hazırlanamadı.", true);
  } finally {
    state.boardInitializing = false;
  }
}

function activeLetters() {
  return state.playerLetters.length ? state.playerLetters : (state.room?.letters ?? []);
}

function renderStock() {
  const remaining = Array.isArray(state.playerBag) ? state.playerBag.length : null;
  ui.stockText.textContent = `TORBA ${remaining ?? "–"}`;
  ui.stockText.classList.toggle("stock-low", remaining !== null && remaining <= LOW_STOCK_THRESHOLD);
}

function isLetterBlocked(letter) {
  const now = Date.now();
  const round = state.room?.round ?? 0;
  return state.effects.some((effect) =>
    effect.targetId === state.uid &&
    effect.type === "block_letter" &&
    effect.letter === letter &&
    effect.round === round &&
    (effect.expiresAt?.toMillis?.() ?? 0) > now
  );
}

function refreshBlockedLetters(force = false) {
  const active = isLetterBlocked("A");
  const changed = active !== state.blockedActive;
  if (!force && !changed) return;
  state.blockedActive = active;
  if (changed && active) {
    state.selected = state.selected.filter((index) => !isLetterBlocked(activeLetters()[index]));
    ui.gameStatus.textContent = "A harflerin kilitlendi!";
    attackFlash();
  } else if (changed && state.room?.phase === "playing") {
    ui.gameStatus.textContent = "A kilidi kalktı";
  }
  if (state.room?.phase === "playing") renderLetters();
}

function renderAttackButton() {
  if (!ui.attackButton) return;
  ui.combatBar.classList.toggle("hidden", Boolean(state.local));
  const me = state.players.find((player) => player.uid === state.uid);
  const used = me?.attackUsedRound === (state.room?.round ?? 0);
  const amount = state.inventory.a_lock ?? 0;
  ui.attackButtonLabel.textContent = used ? "KİLİT KULLANILDI" : amount ? `A KİLİDİ · x${amount}` : "A KİLİDİ · MARKETTE";
  ui.attackButton.disabled = state.room?.phase !== "playing" || used || amount < 1 || isCountdownActive();
}

function openAttackPicker() {
  const me = state.players.find((player) => player.uid === state.uid);
  if ((state.inventory.a_lock ?? 0) < 1) { toast("Marketinden A Kilidi almalısın.", true); return; }
  if (me?.attackUsedRound === (state.room?.round ?? 0)) { toast("Bu tur engel kullandın.", true); return; }
  const opponents = state.players.filter((player) => player.uid !== state.uid && player.round === (state.room?.round ?? 0));
  ui.attackTargets.replaceChildren(...opponents.map((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attack-target";
    const name = document.createElement("span");
    name.textContent = player.name;
    const score = document.createElement("b");
    score.textContent = `${player.score ?? 0} puan`;
    button.append(avatarElement(player.name, player.uid), name, score);
    button.addEventListener("click", () => useAttack(player.uid));
    return button;
  }));
  openSheet(ui.attackPicker);
}

async function useAttack(targetId) {
  try {
    const round = state.room?.round ?? 0;
    const effectRef = doc(roomRef(), "effects", state.uid);
    await runTransaction(db, async (transaction) => {
      const currentRoom = await transaction.get(roomRef());
      const currentPlayer = await transaction.get(playerRef());
      const profile = await transaction.get(profileRef());
      const target = await transaction.get(playerRef(targetId));
      if (!currentRoom.exists() || currentRoom.data().phase !== "playing") throw new Error("Tur sona erdi.");
      if (!currentPlayer.exists() || currentPlayer.data().attackUsedRound === round) throw new Error("Bu tur engel kullandın.");
      if (!target.exists() || targetId === state.uid) throw new Error("Hedef bulunamadı.");
      if (!profile.exists() || (profile.data().inventory?.a_lock ?? 0) < 1) throw new Error("A Kilidi stoğun yok.");
      const nextInventory = { ...(profile.data().inventory ?? { a_lock: 0 }), a_lock: (profile.data().inventory?.a_lock ?? 0) - 1 };
      transaction.update(profileRef(), {
        inventory: nextInventory,
        lastAction: { type: "power", itemId: "a_lock", roomCode: state.roomCode, round },
        updatedAt: serverTimestamp()
      });
      transaction.update(playerRef(), { attackUsedRound: round, lastSeenAt: serverTimestamp() });
      transaction.set(effectRef, {
        ownerId: state.uid,
        targetId,
        type: "block_letter",
        letter: "A",
        round,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + ATTACK_DURATION_MS)
      });
    });
    closeSheet(ui.attackPicker);
    toast("Rakibin A harfleri kilitlendi.");
    attackFlash();
  } catch (error) {
    toast(error.message, true);
  }
}

function canPlay() {
  return state.room?.phase === "playing" && !isCountdownActive()
    && (state.room.endsAt?.toMillis?.() ?? 0) > Date.now();
}

function renderLetters() {
  const letters = activeLetters();
  // Preserve DOM identity, focus and pointer targets between taps.
  while (ui.letterGrid.children.length > letters.length) ui.letterGrid.lastElementChild.remove();
  letters.forEach((letter, index) => {
    let button = ui.letterGrid.children[index];
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      const glyph = document.createElement("span");
      glyph.className = "tile-letter";
      const point = document.createElement("small");
      point.className = "tile-point";
      const order = document.createElement("i");
      order.className = "tile-order";
      button.append(glyph, point, order);
      button.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        button.dataset.pointerAt = String(Date.now());
        selectLetter(index);
      });
      // Keyboard and assistive-technology activation has no pointerdown. Touch
      // taps also emit a click (sometimes with detail 0), which must not undo
      // the selection the pointerdown just made.
      button.addEventListener("click", () => {
        if (Date.now() - Number(button.dataset.pointerAt || 0) < 800) return;
        selectLetter(index);
      });
      ui.letterGrid.append(button);
    }
    const blocked = isLetterBlocked(letter);
    const order = state.selected.indexOf(index);
    const points = letter ? letterPoint(letter) : 0;
    button.className = `letter-tile${order >= 0 ? " selected" : ""}${blocked ? " blocked" : ""}${points >= 7 ? " rare" : ""}`;
    button.children[0].textContent = letter;
    button.children[1].textContent = letter ? points : "";
    button.children[2].textContent = order >= 0 ? order + 1 : "";
    button.disabled = !letter || blocked;
    button.setAttribute("aria-pressed", String(order >= 0));
    button.ariaLabel = blocked ? `${letter} harfi geçici olarak kilitli` : (letter ? `${letter} harfi, ${points} puan` : "Boş harf yuvası");
  });
  renderCurrentWord();
}

function selectLetter(index) {
  if (state.submitting || state.shuffling || !canPlay() || !activeLetters()[index] || isLetterBlocked(activeLetters()[index])) return;
  const position = state.selected.indexOf(index);
  if (position >= 0) {
    // Tapping a chosen tile removes it so typos can be fixed in place.
    state.selected.splice(position, 1);
    playSound("deselect");
    haptic("tap");
    renderLetters();
    return;
  }
  state.selected.push(index);
  playSound("select", state.selected.length - 1);
  haptic("select");
  renderLetters();
  requestAnimationFrame(() => {
    pressTile(ui.letterGrid.children[index]);
    popIn(ui.currentWord.lastElementChild);
  });
}

function currentWord() {
  const letters = activeLetters();
  return state.selected.map((index) => letters[index]).join("");
}

function takenWords() {
  return new Set(roundSubmissions().map((item) => item.word));
}

function wordStatus(word) {
  if ([...word].length < 2) return "short";
  const normalized = normalizeWord(word);
  if (takenWords().has(normalized)) return "taken";
  return isValidWord(normalized) ? "valid" : "unknown";
}

function activeCombo(now = Date.now()) {
  return state.combo > 0 && now - state.lastWordAt <= COMBO_WINDOW_MS ? state.combo : 0;
}

function livePoints(word) {
  return pointsFor(word, activeCombo());
}

function renderCurrentWord() {
  const word = currentWord();
  const status = word ? wordStatus(word) : "empty";
  if (ui.currentWord.dataset.word !== word) {
    ui.currentWord.dataset.word = word;
    if (word) {
      ui.currentWord.replaceChildren(...[...word].map((letter) => {
        const tile = document.createElement("span");
        tile.className = "ctile";
        tile.textContent = letter;
        return tile;
      }));
    } else {
      ui.currentWord.innerHTML = "<span class=\"placeholder\">Harflere dokun, kelimeni kur</span>";
    }
    ui.currentWord.scrollLeft = ui.currentWord.scrollWidth;
  }
  ui.currentWord.dataset.status = status;
  const points = status === "valid" ? livePoints(word) : 0;
  ui.wordBadge.textContent = status === "valid" ? `+${points}` : status === "taken" ? "ALINDI" : "";
  ui.wordBadge.dataset.status = status;
  const busy = state.submitting || state.shuffling;
  const unavailable = busy || !canPlay();
  ui.letterGrid.setAttribute("aria-busy", String(busy));
  ui.submitWordButton.disabled = [...word].length < 2 || unavailable || status === "taken";
  ui.submitWordButton.textContent = state.submitting
    ? "GÖNDERİLİYOR…"
    : status === "valid" ? `GÖNDER · +${points}` : status === "taken" ? "BU KELİME ALINDI" : "GÖNDER";
  ui.submitWordButton.classList.toggle("ready", status === "valid" && !unavailable);
  ui.shuffleButton.disabled = unavailable;
  ui.backspaceButton.disabled = !word || unavailable;
  ui.clearButton.disabled = !word || unavailable;
}

function backspace() {
  if (state.submitting || state.shuffling || !canPlay() || !state.selected.length) return;
  state.selected.pop();
  playSound("deselect");
  renderLetters();
}
function clearWord() {
  if (state.submitting || state.shuffling || !canPlay()) return;
  state.selected = []; renderLetters();
}

async function shuffleLetters() {
  if (state.shuffling || state.submitting || !canPlay()) return;
  const previousLetters = [...activeLetters()];
  const previousVersion = state.boardVersion;
  if (previousLetters.length < 2) return;
  let nextLetters = shuffle(previousLetters);
  if (nextLetters.every((letter, index) => letter === previousLetters[index])) {
    nextLetters = [...previousLetters.slice(1), previousLetters[0]];
  }
  const operation = Symbol("shuffle");
  state.boardOperation = operation;
  state.shuffling = true;
  state.selected = [];
  state.playerLetters = nextLetters;
  state.boardVersion = (previousVersion ?? 0) + 1;
  renderLetters();
  haptic("tap");
  playSound("shuffle");
  requestAnimationFrame(() => {
    for (const tile of ui.letterGrid.children) pressTile(tile);
  });
  if (state.local) {
    state.shuffling = false;
    state.boardOperation = null;
    renderLetters();
    return;
  }
  try {
    await updateDoc(playerRef(), {
      letters: nextLetters,
      boardRound: state.room.round ?? 0,
      boardVersion: increment(1),
      lastSeenAt: serverTimestamp()
    });
  } catch (error) {
    if (state.boardOperation !== operation) return;
    state.playerLetters = previousLetters;
    state.boardVersion = previousVersion;
    toast("Harfler karıştırılamadı.", true);
  } finally {
    if (state.boardOperation === operation) {
      state.shuffling = false;
      state.boardOperation = null;
      renderLetters();
    }
  }
}

function rejectWord(message) {
  invalidWord(ui.currentWord);
  toast(message, true);
}

function onWordAccepted(word, displayed, points) {
  state.combo = Math.min(activeCombo() + 1, MAX_COMBO + 1);
  state.lastWordAt = Date.now();
  ui.gameStatus.textContent = `${displayed} · +${points}`;
  renderCombo();
  renderLetters();
  renderStock();
  renderFoundWords();
  requestAnimationFrame(() => {
    acceptedWord(ui.currentWord, points, [], state.combo);
    comboPop(ui.comboBox, state.combo);
    flashElement(scorePill(myUid()), "good");
  });
  track("word_accepted", { length: [...word].length, points, mode: state.local ? "bot" : "online" });
}

async function submitWord() {
  if (state.submitting || state.shuffling || !canPlay()) return;
  const displayed = currentWord();
  const selectedIndexes = [...state.selected];
  const word = normalizeWord(displayed);
  if ([...word].length < 2) { rejectWord("Kelime çok kısa."); return; }
  if (!isValidWord(word)) {
    state.combo = 0;
    renderCombo();
    renderCurrentWord();
    rejectWord("Bu kelime sözlükte yok.");
    return;
  }
  if (takenWords().has(word)) { rejectWord("Bu kelime bu turda zaten bulundu."); return; }
  if (!Array.isArray(state.playerBag)) { toast("Harf stoğu hazırlanıyor.", true); return; }
  if (state.local) { submitLocalWord(word, displayed, selectedIndexes); return; }
  const submittedRound = state.room.round ?? 0;
  const previousVersion = state.boardVersion;
  const points = livePoints(word);
  const previousLetters = [...activeLetters()];
  const previousBag = [...state.playerBag];
  const optimistic = refillBoard(previousLetters, previousBag, selectedIndexes);
  const operation = Symbol("submit");
  const submissionRoomRef = roomRef();
  const submissionPlayerRef = playerRef();
  const submissionProfileRef = profileRef();
  const submissionUid = state.uid;
  state.boardOperation = operation;
  state.submitting = true;
  state.playerLetters = optimistic.letters;
  state.playerBag = optimistic.bag;
  state.boardVersion = (state.boardVersion ?? 0) + 1;
  state.selected = [];
  renderLetters();
  renderStock();
  requestAnimationFrame(() => {
    const refillElements = selectedIndexes.map((index) => ui.letterGrid.children[index]).filter(Boolean);
    refillTiles(refillElements);
  });
  try {
    let refreshedLetters = null;
    let refreshedBag = null;
    await runTransaction(db, async (transaction) => {
      const currentRoom = await transaction.get(submissionRoomRef);
      if (!currentRoom.exists() || currentRoom.data().phase !== "playing") throw new Error("Tur sona erdi.");
      if (currentRoom.data().endsAt.toMillis() <= Date.now()) throw new Error("Süre doldu.");
      const roomData = currentRoom.data();
      if ((roomData.round ?? 0) !== submittedRound) throw new Error("Yeni tur başladı.");
      const currentPlayer = await transaction.get(submissionPlayerRef);
      if (!currentPlayer.exists()) throw new Error("Oyuncu bulunamadı.");
      const playerData = currentPlayer.data();
      const liveLetters = playerData.boardRound === (roomData.round ?? 0)
        ? playerData.letters
        : roomData.letters;
      const liveBag = Array.isArray(playerData.letterBag)
        ? [...playerData.letterBag]
        : createLetterBag(liveLetters);
      const liveWord = selectedIndexes.map((index) => liveLetters[index]).join("");
      if (normalizeWord(liveWord) !== word) throw new Error("Harfler yenilendi, tekrar seç.");
      const round = roomData.round ?? 0;
      const submissionRef = doc(submissionRoomRef, "submissions", `r${round}_${word}`);
      if ((await transaction.get(submissionRef)).exists()) throw new Error("Bu kelimeyi bir rakibin senden önce buldu.");
      const profileSnapshot = await transaction.get(submissionProfileRef);
      const next = refillBoard(liveLetters, liveBag, selectedIndexes);
      refreshedLetters = next.letters;
      refreshedBag = next.bag;
      transaction.set(submissionRef, { word, ownerId: submissionUid, points, round, createdAt: serverTimestamp() });
      transaction.update(submissionPlayerRef, {
        letters: next.letters,
        letterBag: next.bag,
        boardRound: round,
        boardVersion: increment(1),
        score: increment(points),
        words: increment(1),
        lastSeenAt: serverTimestamp()
      });
      if (profileSnapshot.exists()) {
        const profileData = profileSnapshot.data();
        const profileUpdate = {};
        if ([...word].length > [...(profileData.longestWord ?? "")].length) profileUpdate.longestWord = word;
        if (points > (profileData.bestScore ?? 0)) {
          profileUpdate.bestScore = points;
          profileUpdate.bestScoreWord = word;
        }
        if (Object.keys(profileUpdate).length) {
          transaction.update(submissionProfileRef, { ...profileUpdate, updatedAt: serverTimestamp() });
        }
      }
    });
    if (state.boardOperation !== operation) return;
    state.playerLetters = refreshedLetters ?? state.playerLetters;
    state.playerBag = refreshedBag ?? state.playerBag;
    const id = `r${submittedRound}_${word}`;
    if (!state.submissions.some((item) => item.id === id)) {
      state.submissions.push({ id, word, ownerId: submissionUid, points, round: submittedRound });
      state.submissionOrder.set(id, state.submissionOrder.size);
    }
    onWordAccepted(word, displayed, points);
  } catch (error) {
    if (state.boardOperation !== operation) return;
    state.playerLetters = previousLetters;
    state.playerBag = previousBag;
    state.boardVersion = previousVersion;
    state.selected = [];
    renderLetters();
    renderStock();
    rejectWord(error.message);
  } finally {
    if (state.boardOperation === operation) {
      state.submitting = false;
      state.boardOperation = null;
      renderCurrentWord();
    }
  }
}

function renderCombo(now = Date.now()) {
  const combo = activeCombo(now);
  if (combo !== state.combo && state.combo > 0 && combo === 0) state.combo = 0;
  const bonus = Math.min(combo, MAX_COMBO) * 10;
  ui.comboBox.classList.toggle("active", combo > 0);
  ui.comboText.textContent = combo > 0 ? `SERİ ${combo} · %${bonus}` : "";
  const left = combo > 0 ? Math.max(0, 1 - (now - state.lastWordAt) / COMBO_WINDOW_MS) : 0;
  ui.comboMeter.style.transform = `scaleX(${left})`;
}

function renderFoundWords() {
  const items = roundSubmissions().slice().reverse().slice(0, 14);
  ui.recentWords.replaceChildren(...items.map((item) => {
    const chip = document.createElement("span");
    const mine = item.ownerId === myUid();
    chip.className = `word-chip${mine ? "" : " theirs"}`;
    if (!mine) {
      const owner = document.createElement("i");
      owner.textContent = initials(playerName(item.ownerId));
      owner.style.setProperty("--h", `${avatarHue(item.ownerId)}deg`);
      chip.append(owner);
    }
    chip.append(document.createTextNode(`${upperTr(item.word)} +${item.points}`));
    return chip;
  }));
}

function onOpponentWord(submission) {
  if (state.room?.phase !== "playing") return;
  const name = playerName(submission.ownerId);
  ui.gameStatus.textContent = `${name}: ${upperTr(submission.word)} +${submission.points}`;
  playSound("opponent");
  requestAnimationFrame(() => {
    const pill = scorePill(submission.ownerId);
    flashElement(pill, "bad");
    if (pill) floatText(pill, `+${submission.points}`, "bad");
  });
  // A word we were building may have just been taken.
  renderCurrentWord();
}

function startTimer() {
  clearInterval(state.timer);
  const tick = async () => {
    const end = state.room?.endsAt?.toMillis?.() ?? 0;
    const now = Date.now();
    if (isCountdownActive()) {
      ui.timerText.textContent = Math.round(ROUND_DURATION_MS / 1000);
      ui.timerBar.style.transform = "scaleX(1)";
    } else {
      const msLeft = Math.max(0, end - now);
      const remaining = Math.ceil(msLeft / 1000);
      ui.timerText.textContent = remaining;
      ui.timerBar.style.transform = `scaleX(${Math.min(1, msLeft / ROUND_DURATION_MS)})`;
      document.body.classList.toggle("hurry", remaining <= 10 && remaining > 0 && state.room?.phase === "playing");
      ui.timerText.parentElement.dataset.level = remaining <= 5 ? "danger" : remaining <= 10 ? "warn" : "";
      if (remaining !== state.lastTimerSecond) {
        state.lastTimerSecond = remaining;
        timerPulse(ui.timerText, remaining);
      }
    }
    renderCombo(now);
    renderCurrentWord();
    refreshBlockedLetters();
    if (state.local) { localTick(now); return; }
    if (
      end && now >= end + ROUND_GRACE_MS &&
      state.room?.phase === "playing" && state.room.hostId === state.uid && !state.finishing
    ) {
      state.finishing = true;
      const winner = state.players.map(currentRoundPlayer).sort((a, b) => b.score - a.score)[0];
      try {
        await updateDoc(roomRef(), { phase: "results", winnerId: winner?.uid ?? null, updatedAt: serverTimestamp() });
      } catch (error) {
        state.finishing = false;
      }
    }
  };
  tick();
  state.timer = setInterval(tick, 200);
}

async function toggleReady() {
  try {
    await updateDoc(playerRef(), { ready: !state.ready, lastSeenAt: serverTimestamp() });
    haptic("tap");
  } catch (error) { toast("Bağlantı sorunu, tekrar dene.", true); }
}

async function maybeStartQuickMatch() {
  if (
    state.quickStarting || !state.room?.quickMatch || state.room.phase !== "lobby" ||
    state.room.hostId !== state.uid || state.players.length !== 2 ||
    state.players.some((player) => !player.ready || player.connected === false)
  ) return;
  state.quickStarting = true;
  try { await startMatch(); }
  finally { state.quickStarting = false; }
}

async function startMatch() {
  const players = state.players.map(currentRoundPlayer);
  if (state.room?.hostId !== state.uid || players.length < 2 || players.some((player) => !player.ready || player.connected === false)) return;
  state.finishing = false;
  state.lastTimerSecond = null;
  const startsAt = Date.now() + COUNTDOWN_MS;
  try {
    await updateDoc(roomRef(), {
      phase: "playing", letters: createLetters(randomSeedWord()), boardVersion: increment(1), winnerId: null,
      startsAt: Timestamp.fromMillis(startsAt),
      endsAt: Timestamp.fromMillis(startsAt + ROUND_DURATION_MS), updatedAt: serverTimestamp()
    });
    track("match_start", { players: state.players.length });
  } catch (error) { toast("Maç başlatılamadı.", true); }
}

/* ---------- Offline bot mode ---------- */

function localTime(ms) { return { toMillis: () => ms }; }

function soloBestKey(levelId) { return `wra-solo-best-${levelId}`; }
function soloBest(levelId) { return Number(readStore(soloBestKey(levelId), "0")) || 0; }

function renderSoloBests() {
  for (const badge of ui.soloLevels.querySelectorAll("[data-best]")) {
    const best = soloBest(badge.dataset.best);
    badge.textContent = best ? `REKOR ${best}` : "YENİ";
  }
  const bests = Object.values(BOT_LEVELS).map((level) => ({ level, best: soloBest(level.id) })).filter((item) => item.best);
  const top = bests.sort((a, b) => b.best - a.best)[0];
  ui.profileSoloBest.textContent = top ? `${top.best} · ${top.level.label}` : "–";
}

function openSoloSheet() {
  renderSoloBests();
  openSheet(ui.soloSheet);
}

async function startSolo(levelId = "medium") {
  const level = BOT_LEVELS[levelId] ?? BOT_LEVELS.medium;
  closeSheet(ui.soloSheet);
  if (state.roomCode) { toast("Önce odadan çık.", true); return; }
  try { await dictionaryReady; }
  catch (error) { toast("Sözlük yüklenemedi. İnternetini kontrol et.", true); return; }
  const previous = state.local?.level.id === level.id ? state.local : null;
  const round = (previous?.round ?? 0) + 1;
  const history = previous ? state.roundHistory : [];
  stopLocalMatch();
  resetMatchState();
  state.roundHistory = history;
  state.celebratedRound = null;
  const letters = createLetters(randomSeedWord());
  const myBag = createLetterBag(letters);
  const startsAt = Date.now() + COUNTDOWN_MS;
  const endsAt = startsAt + ROUND_DURATION_MS;
  const myName = state.profile?.displayName ?? (readStore("wra-player-name") || "Sen");
  state.local = {
    level,
    round,
    bot: { letters: [...letters], bag: createLetterBag(letters), nextAt: startsAt + botDelay(level) + 800 },
    hiddenAt: null
  };
  const meUid = state.uid ?? "me";
  state.localUid = meUid;
  state.room = {
    phase: "playing", round, hostId: meUid, letters, local: true,
    startsAt: localTime(startsAt), endsAt: localTime(endsAt), winnerId: null
  };
  state.players = [
    { uid: meUid, name: myName, score: 0, words: 0, round, connected: true, ready: true },
    { uid: BOT_UID, name: level.name, score: 0, words: 0, round, connected: true, ready: true, bot: true }
  ];
  state.playerLetters = letters;
  state.playerBag = myBag;
  state.boardVersion = 0;
  track("solo_start", { level: level.id });
  renderStock();
  routeRoomPhase();
}

function localMe() { return state.players.find((player) => player.uid === (myUid())); }
function localBot() { return state.players.find((player) => player.uid === BOT_UID); }

function submitLocalWord(word, displayed, selectedIndexes) {
  const points = livePoints(word);
  const next = refillBoard(activeLetters(), state.playerBag, selectedIndexes);
  state.playerLetters = next.letters;
  state.playerBag = next.bag;
  state.boardVersion = (state.boardVersion ?? 0) + 1;
  state.selected = [];
  const me = localMe();
  me.score += points;
  me.words += 1;
  const id = `r${state.room.round}_${word}`;
  state.submissions.push({ id, word, ownerId: me.uid, points, round: state.room.round });
  state.submissionOrder.set(id, state.submissionOrder.size);
  renderScores();
  onWordAccepted(word, displayed, points);
  requestAnimationFrame(() => {
    refillTiles(selectedIndexes.map((index) => ui.letterGrid.children[index]).filter(Boolean));
  });
}

function botMove() {
  const { level, bot } = state.local;
  const candidates = findFormableWords(bot.letters, { minLength: level.minLength, maxLength: level.maxLength })
    .filter((candidate) => !isLikelyStem(candidate));
  const word = chooseBotWord(candidates, level, takenWords());
  if (!word) {
    // Stuck bots swap a few tiles, like a player shuffling for fresh ideas.
    const indexes = shuffle(bot.letters.map((_, index) => index)).slice(0, 3);
    const next = refillBoard(bot.letters, bot.bag, indexes);
    bot.letters = next.letters;
    bot.bag = next.bag;
    return;
  }
  const indexes = indexesForWord(word, bot.letters);
  if (!indexes) return;
  const next = refillBoard(bot.letters, bot.bag, indexes);
  bot.letters = next.letters;
  bot.bag = next.bag;
  const points = pointsFor(word, 0);
  const player = localBot();
  player.score += points;
  player.words += 1;
  const id = `r${state.room.round}_${word}`;
  const submission = { id, word, ownerId: BOT_UID, points, round: state.room.round };
  state.submissions.push(submission);
  state.submissionOrder.set(id, state.submissionOrder.size);
  renderScores();
  renderFoundWords();
  onOpponentWord(submission);
}

function localTick(now) {
  if (!state.local || state.room?.phase !== "playing" || isCountdownActive()) return;
  const end = state.room.endsAt.toMillis();
  if (now >= end) { finishLocalRound(); return; }
  if (now >= state.local.bot.nextAt) {
    botMove();
    state.local.bot.nextAt = now + botDelay(state.local.level);
  }
}

function finishLocalRound() {
  const sorted = state.players.slice().sort((a, b) => b.score - a.score);
  const tie = sorted.length > 1 && sorted[0].score === sorted[1].score;
  state.room.phase = "results";
  state.room.winnerId = tie ? null : sorted[0].uid;
  state.roundHistory.push({
    round: state.room.round,
    winnerId: state.room.winnerId,
    players: sorted.map((player) => ({ uid: player.uid, name: player.name, score: player.score }))
  });
  state.selected = [];
  routeRoomPhase();
}

function celebrateLocalRound() {
  const key = roundKey();
  if (state.celebratedRound === key) return;
  state.celebratedRound = key;
  const me = localMe();
  const levelId = state.local.level.id;
  const best = soloBest(levelId);
  const record = me.score > best;
  if (record) writeStore(soloBestKey(levelId), String(me.score));
  const levelLabel = state.local.level.label.toLocaleUpperCase("tr-TR");
  ui.rewardText.textContent = record && me.score > 0
    ? `YENİ REKOR · ${me.score} PUAN`
    : best > 0 ? `${levelLabel} REKORU · ${best}` : "";
  ui.rewardText.classList.toggle("record", record && me.score > 0);
  const won = state.room.winnerId === me.uid;
  requestAnimationFrame(() => celebrate(ui.winnerText, false, won || (record && me.score > 0)));
  track("solo_finish", { level: levelId, score: me.score, won });
}

function stopLocalMatch() {
  if (!state.local) return;
  clearInterval(state.timer);
  state.local = null;
  state.room = null;
  state.players = [];
  ui.rewardText.classList.remove("record");
  hideCountdown();
}

// Pause the offline match while the app is in the background.
function handleLocalVisibility() {
  if (!state.local || state.room?.phase !== "playing") return;
  if (document.hidden) { state.local.hiddenAt = Date.now(); return; }
  if (!state.local.hiddenAt) return;
  const pausedFor = Date.now() - state.local.hiddenAt;
  state.local.hiddenAt = null;
  const startsAt = state.room.startsAt.toMillis() + pausedFor;
  const endsAt = state.room.endsAt.toMillis() + pausedFor;
  state.room.startsAt = localTime(startsAt);
  state.room.endsAt = localTime(endsAt);
  state.local.bot.nextAt += pausedFor;
  if (state.lastWordAt) state.lastWordAt += pausedFor;
  if (pausedFor > 1500) toast("Oyun duraklatıldı, kaldığın yerden devam.");
}

/* ---------- Results ---------- */

function initials(name) {
  return (name?.trim()?.[0] ?? "?").toLocaleUpperCase("tr-TR");
}

function avatarHue(seed) {
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function renderPodium(sorted) {
  if (!ui.podium) return;
  const top = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
  ui.podium.replaceChildren(...top.map((player) => {
    const rank = sorted.indexOf(player) + 1;
    const step = document.createElement("div");
    step.className = `podium-step rank-${rank}${player.uid === (myUid()) ? " me" : ""}`;
    step.innerHTML = rank === 1
      ? `<svg class="podium-crown"><use href="#i-crown"/></svg><div class="podium-avatar"></div><strong class="podium-name"></strong><span class="podium-score"></span><div class="podium-bar"><b></b></div>`
      : `<div class="podium-avatar"></div><strong class="podium-name"></strong><span class="podium-score"></span><div class="podium-bar"><b></b></div>`;
    const avatar = step.querySelector(".podium-avatar");
    avatar.textContent = player.uid === BOT_UID ? "🤖" : initials(player.name);
    avatar.style.setProperty("--h", `${avatarHue(player.uid)}deg`);
    step.querySelector(".podium-name").textContent = player.name;
    step.querySelector(".podium-score").textContent = `${player.score ?? 0} puan · ${player.words ?? 0} kelime`;
    step.querySelector(".podium-bar b").textContent = String(rank);
    return step;
  }));
}

function renderResults() {
  if (!state.players.length || state.room?.phase !== "results") return;
  const meUid = myUid();
  const sorted = state.players.map(currentRoundPlayer).sort((a, b) => b.score - a.score);
  const winnerId = state.local ? state.room.winnerId : (state.room?.winnerId ?? sorted[0]?.uid);
  const winner = sorted.find((player) => player.uid === winnerId);
  const won = winnerId === meUid;
  ui.resultsEyebrow.textContent = state.local ? `BOTA KARŞI · ${state.local.level.label.toLocaleUpperCase("tr-TR")}` : "TUR SONUÇLARI";
  ui.winnerText.textContent = sorted[0]?.score === 0
    ? "Kimse kelime bulamadı"
    : !winner ? "Berabere!" : won ? "Kazandın!" : `${winner.name} kazandı`;
  document.body.classList.toggle("lost", Boolean(winner) && !won);
  renderPodium(sorted);
  const rest = sorted.slice(3);
  ui.resultsList.classList.toggle("hidden", rest.length === 0);
  ui.resultsList.replaceChildren(...rest.map((player, index) => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span class="result-rank">#${index + 4}</span><strong></strong><b></b>`;
    row.querySelector("strong").textContent = player.name;
    row.querySelector("b").textContent = `${player.score ?? 0} puan`;
    return row;
  }));
  if (state.local) {
    ui.rematchButton.classList.remove("hidden");
    ui.rematchButton.textContent = "RÖVANŞ";
    ui.rematchStatus.textContent = "";
  } else {
    ui.rematchButton.textContent = "TEKRAR OYNA";
    ui.rematchStatus.textContent = state.room?.hostId === state.uid ? "" : "Oda sahibi yeni turu başlatabilir";
  }
  renderMyWords();
  renderRoundRecap();
  renderSeriesRecap();
}

function renderMyWords() {
  const meUid = myUid();
  const mine = roundSubmissions().filter((item) => item.ownerId === meUid);
  ui.myWords.classList.toggle("hidden", mine.length === 0);
  if (!mine.length) return;
  const total = mine.reduce((sum, item) => sum + item.points, 0);
  ui.myWordsSummary.textContent = `${mine.length} kelime · ${total} puan`;
  const best = mine.reduce((top, item) => (item.points > top.points ? item : top), mine[0]);
  ui.myWordsList.replaceChildren(...mine.map((item) => {
    const chip = document.createElement("span");
    chip.className = `word-chip${item === best ? " best" : ""}`;
    chip.textContent = `${upperTr(item.word)} +${item.points}`;
    return chip;
  }));
}

function playerName(uid) {
  return state.players.find((player) => player.uid === uid)?.name ?? "Rakip";
}

function renderRoundRecap() {
  if (!ui.roundRecap) return;
  const recap = roundRecap();
  const active = recap.longest || recap.topScore;
  ui.roundRecap.classList.toggle("hidden", !active);
  if (!active) return;
  ui.recapLongest.textContent = recap.longest
    ? `${upperTr(recap.longest.word)} · ${playerName(recap.longest.ownerId)}`
    : "–";
  ui.recapTopScore.textContent = recap.topScore
    ? `${upperTr(recap.topScore.word)} · +${recap.topScore.points} · ${playerName(recap.topScore.ownerId)}`
    : "–";
  ui.recapTotal.textContent = `Bu turda toplam ${recap.total} kelime bulundu`;
}

function renderSeriesRecap() {
  if (!ui.seriesRecap) return;
  if (state.roundHistory.length < 2) { ui.seriesRecap.classList.add("hidden"); return; }
  const wins = {};
  for (const round of state.roundHistory) {
    if (!round.winnerId) continue;
    wins[round.winnerId] = (wins[round.winnerId] ?? 0) + 1;
  }
  const seriesPlayers = state.players
    .map((player) => ({ uid: player.uid, name: player.name, wins: wins[player.uid] ?? 0 }))
    .sort((a, b) => b.wins - a.wins);
  ui.seriesRecap.classList.remove("hidden");
  ui.seriesList.replaceChildren(...seriesPlayers.map((player) => {
    const chip = document.createElement("span");
    chip.className = "series-chip";
    chip.textContent = `${player.name} ${player.wins}`;
    return chip;
  }));
}

async function awardRound() {
  if (state.rewarding || !state.roomCode) return;
  state.rewarding = true;
  const key = roundKey();
  let diamondBonus = false;
  try {
    const reward = await runTransaction(db, async (transaction) => {
      const currentRoom = await transaction.get(roomRef());
      const currentPlayer = await transaction.get(playerRef());
      const profile = await transaction.get(profileRef());
      if (!currentRoom.exists() || currentRoom.data().phase !== "results" || !currentPlayer.exists() || !profile.exists()) return 0;
      const roundNumber = currentRoom.data().round ?? 0;
      if (currentPlayer.data().rewardedRound === roundNumber) return 0;
      const isWinner = currentRoom.data().winnerId === state.uid;
      const amount = isWinner ? 40 : 5;
      const nextWins = (profile.data().wins ?? 0) + (isWinner ? 1 : 0);
      const diamonds = isWinner && nextWins % 3 === 0 ? 1 : 0;
      transaction.update(profileRef(), {
        coins: increment(amount),
        wins: increment(isWinner ? 1 : 0),
        diamonds: increment(diamonds),
        lastAction: { type: "reward", roomCode: state.roomCode, round: roundNumber },
        updatedAt: serverTimestamp()
      });
      transaction.update(playerRef(), { rewardedRound: roundNumber, lastSeenAt: serverTimestamp() });
      return { coins: amount, diamonds };
    });
    if (reward?.coins > 0) {
      ui.rewardText.textContent = `+${reward.coins} JETON${reward.diamonds ? ` · +${reward.diamonds} ELMAS` : ""}`;
      diamondBonus = Boolean(reward.diamonds);
    }
  } catch (error) {
    ui.rewardText.textContent = "";
  } finally {
    state.rewarding = false;
  }
  if (state.room?.phase === "results" && state.celebratedRound !== key) {
    state.celebratedRound = key;
    const won = state.room?.winnerId === state.uid;
    requestAnimationFrame(() => celebrate(ui.winnerText, diamondBonus, won));
  }
}

async function rematch() {
  if (state.local) { startSolo(state.local.level.id); return; }
  if (state.room?.hostId !== state.uid) return;
  try {
    await updateDoc(roomRef(), {
      phase: "lobby", round: increment(1), letters: [], startsAt: null, endsAt: null, winnerId: null, updatedAt: serverTimestamp()
    });
    state.finishing = false;
  } catch (error) { toast("Yeni tur açılamadı.", true); }
}

async function copyCode() {
  if (!state.roomCode) return;
  const text = `Word Rush Arena'da odama gel! Oda kodu: ${state.roomCode}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: "Word Rush Arena", text, url: location.origin.startsWith("http") ? location.origin : undefined });
      return;
    }
    await navigator.clipboard.writeText(state.roomCode);
    toast("Oda kodu kopyalandı.");
  } catch (error) {
    if (error?.name !== "AbortError") toast(`Oda kodu: ${state.roomCode}`);
  }
}

async function copyFriendCode() {
  const code = ui.profileCode.textContent;
  try { await navigator.clipboard.writeText(code); toast("Arkadaş kodun kopyalandı."); }
  catch { toast(`Arkadaş kodun: ${code}`); }
}

function leaveListeners() {
  for (const unsubscribe of state.unsubscribers) unsubscribe();
  state.unsubscribers = [];
  clearInterval(state.timer);
  clearInterval(state.heartbeat);
}

async function requestLeaveRoom() {
  if (state.room?.phase === "playing") {
    const message = state.local ? "Bot maçından çıkarsan bu tur sayılmaz. Emin misin?" : "Oyundan çıkarsan bu turu kaybedersin. Emin misin?";
    const confirmed = await showConfirm(message);
    if (!confirmed) return;
  }
  await leaveRoom();
}

async function leaveRoom() {
  if (state.local) {
    stopLocalMatch();
    resetMatchState();
    document.body.classList.remove("hurry", "lost");
    showScreen("homeScreen");
    return;
  }
  const leftCode = state.roomCode;
  if (state.roomCode && state.uid) await updateDoc(playerRef(), { connected: false, lastSeenAt: serverTimestamp() }).catch(() => {});
  leaveListeners();
  persistRoomCode(null);
  Object.assign(state, { roomCode: null, room: null, players: [], ready: false, rewarding: false });
  resetMatchState();
  document.body.classList.remove("hurry", "lost");
  if (leftCode) writeStore("wra-last-left-room", leftCode);
  showScreen("homeScreen");
  checkRejoinBanner();
}

async function checkRejoinBanner() {
  const code = readStore("wra-last-left-room");
  if (!code || !state.uid) { hideRejoinBanner(); return; }
  try {
    const [roomSnapshot, playerSnapshot] = await Promise.all([getDoc(roomRef(code)), getDoc(playerRef(state.uid, code))]);
    if (!roomSnapshot.exists() || !playerSnapshot.exists()) {
      writeStore("wra-last-left-room", null);
      hideRejoinBanner();
      return;
    }
    ui.rejoinCode.textContent = code;
    ui.rejoinBanner.classList.remove("hidden");
  } catch (error) {
    hideRejoinBanner();
  }
}

function hideRejoinBanner() {
  ui.rejoinBanner.classList.add("hidden");
}

function dismissRejoinBanner() {
  writeStore("wra-last-left-room", null);
  hideRejoinBanner();
}

async function rejoinLastRoom() {
  const code = readStore("wra-last-left-room");
  if (!code) return;
  hideRejoinBanner();
  const resumed = await resumeRoom(code);
  writeStore("wra-last-left-room", null);
  if (!resumed) toast("Oda artık mevcut değil.", true);
}

function setBusy(value) {
  const online = Boolean(state.uid) && state.profile !== null;
  ui.createRoomButton.disabled = value || !online;
  ui.joinRoomButton.disabled = value || !online;
}

function setOnlineEnabled(enabled) {
  ui.createRoomButton.disabled = !enabled;
  ui.joinRoomButton.disabled = !enabled;
  ui.quickMatchButton.disabled = !enabled;
}

function setAuthBusy(value) {
  authBusy = value;
  ui.googleLoginButton.disabled = value;
  ui.guestLoginButton.disabled = value;
  ui.googleLoginButton.setAttribute("aria-busy", String(value));
}

function googleRecoveryOptions() {
  return {
    credentialFromError: (error) => GoogleAuthProvider.credentialFromError(error),
    confirmSwitch: () => showConfirm("Bu Google hesabı zaten kayıtlı. Mevcut hesabına geçilsin mi? Misafir puanların bu hesapla birleştirilmez.", "HESABA GEÇ", "GOOGLE HESABINA GEÇ"),
    signInExisting: (credential) => signInWithCredential(auth, credential),
    canRedirect: location.hostname === firebaseConfig.authDomain,
    redirect: () => auth.currentUser?.isAnonymous
      ? linkWithRedirect(auth.currentUser, googleProvider)
      : signInWithRedirect(auth, googleProvider)
  };
}

async function googleLogin() {
  if (authBusy) return;
  setAuthBusy(true);
  try {
    try {
      if (auth.currentUser?.isAnonymous) await linkWithPopup(auth.currentUser, googleProvider);
      else await signInWithPopup(auth, googleProvider);
    } catch (error) {
      await recoverGoogleLogin(error, googleRecoveryOptions());
    }
  } catch (error) {
    toast(authErrorMessage(error), true);
  } finally {
    setAuthBusy(false);
  }
}

async function guestLogin() {
  if (authBusy) return;
  setAuthBusy(true);
  try { await signInAnonymously(auth); }
  catch (error) { toast(authErrorMessage(error), true); }
  finally { setAuthBusy(false); }
}

async function logout() {
  if (state.roomCode || state.local) await leaveRoom();
  if (state.quickMatching && state.uid) {
    await deleteDoc(doc(db, "matchmaking", state.uid)).catch(() => {});
  }
  state.profileUnsubscriber?.();
  state.friendsUnsubscriber?.();
  state.inviteUnsubscriber?.();
  state.matchmakingUnsubscriber?.();
  hideInviteBanner();
  setQuickMatchUi(false);
  await signOut(auth);
}

/* ---------- Device integration ---------- */

function gameScreenActive() {
  return state.currentScreen === "gameScreen" && ui.confirmOverlay.classList.contains("hidden")
    && SHEETS().every((sheet) => sheet.classList.contains("hidden"));
}

// Physical keyboards: type letters, Enter submits, Backspace deletes.
function handleGameKey(event) {
  if (event.key === "Escape" && closeTopOverlay()) { event.preventDefault(); return; }
  if (!gameScreenActive() || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement) return;
  const onButton = target instanceof HTMLButtonElement;
  if (event.key === "Enter" && !onButton) { event.preventDefault(); submitWord(); return; }
  if (event.key === "Backspace") { event.preventDefault(); backspace(); return; }
  if (event.key === "Escape") { clearWord(); return; }
  if (event.key === " " && !onButton) { event.preventDefault(); shuffleLetters(); return; }
  if (event.key.length !== 1) return;
  const letter = upperTr(event.key);
  if (!/^[A-ZÇĞIİÖŞÜ]$/u.test(letter)) return;
  const letters = activeLetters();
  const index = letters.findIndex((candidate, position) => candidate === letter && !state.selected.includes(position) && !isLetterBlocked(candidate));
  if (index >= 0) { event.preventDefault(); selectLetter(index); }
  else if (canPlay()) { haptic("tap"); invalidWord(ui.currentWord); }
}

async function syncWakeLock() {
  const wanted = state.currentScreen === "gameScreen" && !document.hidden;
  try {
    if (wanted && !state.wakeLock && navigator.wakeLock?.request) {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener?.("release", () => { state.wakeLock = null; });
    } else if (!wanted && state.wakeLock) {
      const lock = state.wakeLock;
      state.wakeLock = null;
      await lock.release();
    }
  } catch { state.wakeLock = null; }
}

function renderSettings() {
  ui.soundToggle.setAttribute("aria-checked", String(isSoundEnabled()));
  ui.hapticsToggle.setAttribute("aria-checked", String(isHapticsEnabled()));
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true || isNative;
  ui.installButton.classList.toggle("hidden", !state.installPrompt || standalone);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  ui.iosInstallHint.classList.toggle("hidden", !ios || standalone);
}

async function installApp() {
  const prompt = state.installPrompt;
  if (!prompt) return;
  state.installPrompt = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    track("install_prompt", { outcome: choice?.outcome ?? "unknown" });
  } catch { /* the browser may refuse a second prompt */ }
  renderSettings();
}

function handleBackNavigation() {
  if (closeTopOverlay()) return true;
  if (state.quickMatching) { cancelQuickMatch(); return true; }
  if (["lobbyScreen", "gameScreen", "resultsScreen"].includes(state.currentScreen) && inMatch()) { requestLeaveRoom(); return true; }
  if (["marketScreen", "profileScreen"].includes(state.currentScreen)) { showScreen("homeScreen"); return true; }
  return false;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || isNative || location.protocol !== "https:") return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

function maybeShowHowTo() {
  if (readStore("wra-howto-seen")) return;
  writeStore("wra-howto-seen", "1");
  setTimeout(() => { if (state.currentScreen === "homeScreen") openSheet(ui.howToSheet); }, 700);
}

// Home-screen shortcuts from the web app manifest (?mode=bot / ?mode=quick).
const launchMode = new URLSearchParams(location.search).get("mode");
let launchHandled = false;
function handleLaunchMode(onlineReady) {
  if (launchHandled || !launchMode || inMatch()) return;
  if (launchMode === "bot") { launchHandled = true; openSoloSheet(); }
  else if (launchMode === "quick" && onlineReady) { launchHandled = true; quickMatch(); }
}

function renderAuthUi(user) {
  const signedIn = Boolean(user);
  const guest = Boolean(user?.isAnonymous);
  ui.googleLoginButton.classList.toggle("hidden", (signedIn && !guest) || isNative);
  ui.googleLoginButton.innerHTML = `<span>G</span> ${guest ? "İLERLEMENİ GOOGLE'A BAĞLA" : "GOOGLE İLE GİRİŞ"}`;
  ui.guestLoginButton.classList.toggle("hidden", signedIn);
  ui.nativeAuthNote.classList.toggle("hidden", !isNative || signedIn);
  ui.authPanel.classList.toggle("hidden", signedIn && (!guest || isNative));
  ui.authPanel.classList.toggle("compact", signedIn);
  ui.logoutButton.classList.toggle("hidden", !signedIn);
  ui.heroLine.innerHTML = signedIn
    ? "Harfleri diz, kelimeyi kap, rakibini geç. <b>75 saniyen</b> var."
    : "Çevrimiçi düellolar için giriş yap ya da <b>hemen bota karşı</b> başla.";
}

ui.createRoomButton.addEventListener("click", createRoom);
ui.joinRoomButton.addEventListener("click", joinRoom);
ui.googleLoginButton.addEventListener("click", googleLogin);
ui.guestLoginButton.addEventListener("click", guestLogin);
ui.logoutButton.addEventListener("click", logout);
ui.quickMatchButton.addEventListener("click", quickMatch);
ui.cancelQuickMatchButton.addEventListener("click", cancelQuickMatch);
ui.quickMatchBotButton.addEventListener("click", quickMatchToBot);
ui.soloButton.addEventListener("click", openSoloSheet);
ui.closeSoloButton.addEventListener("click", () => closeSheet(ui.soloSheet));
for (const button of ui.soloLevels.querySelectorAll("[data-level]")) {
  button.addEventListener("click", () => startSolo(button.dataset.level));
}
ui.profileButton.addEventListener("click", () => showScreen("profileScreen"));
ui.profileBackButton.addEventListener("click", () => showScreen("homeScreen"));
ui.profileCodeButton.addEventListener("click", copyFriendCode);
ui.marketBackButton.addEventListener("click", () => showScreen("homeScreen"));
ui.navPlay.addEventListener("click", () => showScreen("homeScreen"));
ui.navMarket.addEventListener("click", () => showScreen("marketScreen"));
ui.navProfile.addEventListener("click", () => showScreen("profileScreen"));
ui.settingsButton.addEventListener("click", () => { renderSettings(); openSheet(ui.settingsSheet); });
ui.closeSettingsButton.addEventListener("click", () => closeSheet(ui.settingsSheet));
ui.soundToggle.addEventListener("click", () => { setSound(!isSoundEnabled()); renderSettings(); playSound("accept"); });
ui.hapticsToggle.addEventListener("click", () => { setHaptics(!isHapticsEnabled()); renderSettings(); });
ui.installButton.addEventListener("click", installApp);
ui.howToButton.addEventListener("click", () => openSheet(ui.howToSheet));
ui.settingsHowToButton.addEventListener("click", () => { closeSheet(ui.settingsSheet); openSheet(ui.howToSheet); });
ui.closeHowToButton.addEventListener("click", () => closeSheet(ui.howToSheet));
ui.howToDoneButton.addEventListener("click", () => closeSheet(ui.howToSheet));
ui.addFriendButton.addEventListener("click", addFriend);
ui.friendCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") addFriend(); });
ui.roomCodeInput.addEventListener("input", () => { ui.roomCodeInput.value = ui.roomCodeInput.value.replace(/\D/g, "").slice(0, 5); });
ui.roomCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinRoom(); });
ui.playerName.addEventListener("change", () => { if (ui.playerName.value.trim().length >= 2) writeStore("wra-player-name", ui.playerName.value.trim()); });
ui.copyCodeButton.addEventListener("click", copyCode);
ui.readyButton.addEventListener("click", toggleReady);
ui.startButton.addEventListener("click", startMatch);
ui.attackButton.addEventListener("click", openAttackPicker);
ui.closeAttackButton.addEventListener("click", () => closeSheet(ui.attackPicker));
ui.inviteFriendButton.addEventListener("click", openInvitePicker);
ui.closeInviteButton.addEventListener("click", () => closeSheet(ui.invitePicker));
ui.inviteJoinButton.addEventListener("click", acceptInvite);
ui.inviteDismissButton.addEventListener("click", dismissInvite);
ui.shuffleButton.addEventListener("click", shuffleLetters);
ui.backspaceButton.addEventListener("click", backspace);
ui.clearButton.addEventListener("click", clearWord);
ui.submitWordButton.addEventListener("click", submitWord);
ui.rematchButton.addEventListener("click", rematch);
ui.homeButton.addEventListener("click", leaveRoom);
ui.leaveButton.addEventListener("click", requestLeaveRoom);
ui.rejoinButton.addEventListener("click", rejoinLastRoom);
ui.rejoinDismissButton.addEventListener("click", dismissRejoinBanner);
for (const sheet of SHEETS()) {
  sheet.addEventListener("pointerdown", (event) => { if (event.target === sheet) closeSheet(sheet); });
}
document.addEventListener("keydown", handleGameKey);
document.addEventListener("visibilitychange", () => { handleLocalVisibility(); syncWakeLock(); });
document.addEventListener("contextmenu", (event) => { if (event.target.closest?.(".letter-tile, .btn, .mode-card")) event.preventDefault(); });
window.addEventListener("online", () => setConnection("online", state.uid ? "Çevrimiçi" : "Giriş gerekli"));
window.addEventListener("offline", () => { setConnection("offline", "Çevrimdışı"); toast("Bağlantı yok — bota karşı oynamaya devam edebilirsin."); });
window.addEventListener("beforeunload", () => { if (state.roomCode) updateDoc(playerRef(), { connected: false }).catch(() => {}); });
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; renderSettings(); });
window.Capacitor?.Plugins?.App?.addListener?.("backButton", () => {
  if (!handleBackNavigation()) window.Capacitor.Plugins.App.exitApp?.();
});

document.body.classList.toggle("native", isNative);
ui.appVersion.textContent = `v${APP_VERSION}`;
ui.playerName.value = readStore("wra-player-name", "");
renderSettings();
renderAuthUi(null);
initEffects(ui.effectsCanvas);
registerServiceWorker();
if (isNative) window.Capacitor?.Plugins?.SplashScreen?.hide?.().catch?.(() => {});
// Never leave players on the splash if auth is slow; bot mode works offline.
setTimeout(() => { if (state.currentScreen === "loadingScreen") showScreen("homeScreen"); }, 3500);

onAuthStateChanged(auth, async (user) => {
  const signedIn = Boolean(user);
  const guest = Boolean(user?.isAnonymous);
  renderAuthUi(user);
  setOnlineEnabled(false);
  if (state.uid !== user?.uid) {
    state.profileUnsubscriber?.();
    state.friendsUnsubscriber?.();
    state.inviteUnsubscriber?.();
    state.profile = null;
  }
  if (!signedIn) {
    state.uid = null;
    ui.coinBadge.classList.add("hidden");
    ui.diamondBadge.classList.add("hidden");
    ui.profileButton.classList.add("hidden");
    setConnection("offline", "Giriş gerekli");
    if (!state.local) showScreen("homeScreen");
    maybeShowHowTo();
    handleLaunchMode(false);
    return;
  }
  state.uid = user.uid;
  if (state.currentScreen === "loadingScreen") showScreen("homeScreen");
  setConnection("pending", "Bağlanıyor");
  try {
    await dictionaryReady;
    await ensureProfile(user);
  }
  catch (error) {
    setConnection("offline", "Bağlantı yok");
    setOnlineEnabled(false);
    if (!state.local && !state.roomCode) showScreen("homeScreen");
    toast("Çevrimiçi mod hazırlanamadı. Bota karşı oynayabilirsin.", true);
    handleLaunchMode(false);
    return;
  }
  if (auth.currentUser?.uid !== user.uid) return;
  setOnlineEnabled(true);
  ui.playerName.value = readStore("wra-player-name") || user.displayName || state.profile?.displayName || "";
  setConnection("online", guest ? "Misafir" : "Çevrimiçi");
  const savedRoomCode = readStore("wra-room-code");
  const resumed = savedRoomCode && !state.local ? await resumeRoom(savedRoomCode) : false;
  if (!resumed && !state.local && !state.roomCode) { if (state.currentScreen !== "homeScreen") showScreen("homeScreen"); checkRejoinBanner(); }
  maybeShowHowTo();
  handleLaunchMode(true);
  track("app_ready", { native: isNative });
});

if (!isNative) {
  getRedirectResult(auth)
    .catch((error) => recoverGoogleLogin(error, { ...googleRecoveryOptions(), canRedirect: false }))
    .catch((error) => toast(authErrorMessage(error), true));
}
