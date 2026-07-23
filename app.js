import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported, logEvent } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, getRedirectResult, linkWithPopup,
  linkWithRedirect, onAuthStateChanged, signInAnonymously, signInWithPopup, signInWithRedirect, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  Timestamp, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, increment, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { appCheckSiteKey, firebaseConfig } from "./firebase-config.js";
import { isValidWord, loadDictionary, normalizeWord, randomSeedWord } from "./words.js";
import {
  acceptedWord, attackFlash, celebrate, comboPop, enterScreen, haptic, initEffects,
  invalidWord, isSoundEnabled, pressTile, purchaseFx, refillTiles, setSound, timerPulse
} from "./effects.js";

const app = initializeApp(firebaseConfig);
if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
let analytics = null;
analyticsSupported().then((supported) => { if (supported) analytics = getAnalytics(app); });

const emulatorMode = location.hostname === "localhost" && new URLSearchParams(location.search).has("emulator");
if (emulatorMode) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
}

const $ = (id) => document.getElementById(id);
const screens = ["loadingScreen", "homeScreen", "marketScreen", "profileScreen", "lobbyScreen", "gameScreen", "resultsScreen"];
const ui = Object.fromEntries([
  "connectionBadge", "leaveButton", "playerName", "roomCodeInput", "createRoomButton", "joinRoomButton",
  "roomCodeText", "copyCodeButton", "playerCount", "lobbyPlayers", "readyButton", "startButton",
  "timerText", "scoreStrip", "rankText", "gameStatus", "stockText", "comboText", "letterGrid", "currentWord",
  "coinBadge", "coinText", "attackButton", "attackPicker", "attackTargets", "closeAttackButton", "rewardText",
  "diamondBadge", "diamondText", "profileButton", "profileAvatar", "googleLoginButton", "guestLoginButton", "logoutButton",
  "quickMatchButton", "quickMatchStatus", "profileName", "profileCode", "profileCoins", "profileDiamonds",
  "friendCodeInput", "addFriendButton", "friendList", "friendRequests", "profileBackButton",
  "effectsCanvas", "bottomNav", "navPlay", "navMarket", "navProfile", "marketGrid", "marketBackButton",
  "marketCoins", "marketDiamonds", "soundToggle",
  "shuffleButton", "backspaceButton", "clearButton", "submitWordButton", "recentWords", "winnerText", "resultsList",
  "rematchButton", "rematchStatus", "homeButton", "toast",
  "roundRecap", "recapLongest", "recapTopScore", "recapTotal", "seriesRecap", "seriesList",
  "inviteFriendButton", "invitePicker", "inviteFriendTargets", "closeInviteButton",
  "inviteBanner", "inviteText", "inviteJoinButton", "inviteDismissButton",
  "profileWins", "profileLongestWord", "profileBestWord"
].map((id) => [id, $(id)]));

const dictionaryReady = loadDictionary();

const LETTER_POINTS = Object.freeze({
  A: 1, B: 3, C: 4, Ç: 4, D: 3, E: 1, F: 7, G: 5, Ğ: 8,
  H: 5, I: 2, İ: 2, J: 10, K: 2, L: 1, M: 2, N: 1, O: 2,
  Ö: 7, P: 5, R: 1, S: 2, Ş: 4, T: 1, U: 2, Ü: 3, V: 7,
  Y: 5, Z: 4
});
const LETTER_STOCK = Object.freeze({
  A: 13, B: 2, C: 2, Ç: 2, D: 2, E: 8, F: 1, G: 1, Ğ: 1,
  H: 1, I: 4, İ: 7, J: 1, K: 7, L: 7, M: 4, N: 5, O: 3,
  Ö: 1, P: 1, R: 6, S: 3, Ş: 2, T: 5, U: 3, Ü: 2, V: 1,
  Y: 3, Z: 2
});
const VOWELS = new Set(["A", "E", "I", "İ", "O", "Ö", "U", "Ü"]);
const ATTACK_DURATION_MS = 8000;
const ROUND_GRACE_MS = 2000;
const MARKET_ITEMS = Object.freeze([
  { id: "a_lock", title: "A Kilidi", description: "Rakibin A taşlarını 8 sn kilitler", icon: "A×", currency: "coins", price: 25, kind: "consumable" },
  { id: "aurora", title: "Aurora", description: "Canlı mor ve turkuaz taş teması", icon: "◇", currency: "diamonds", price: 3, kind: "theme" },
  { id: "obsidian", title: "Obsidian", description: "Koyu cam ve kırmızı parıltı", icon: "◆", currency: "diamonds", price: 5, kind: "theme" },
  { id: "royal", title: "Royal Gold", description: "Altın kenarlı premium taşlar", icon: "★", currency: "diamonds", price: 8, kind: "theme" }
]);

function letterPoint(letter) {
  return LETTER_POINTS[letter.toLocaleUpperCase("tr-TR")] ?? 1;
}

function createFullLetterBag() {
  return shuffle(Object.entries(LETTER_STOCK).flatMap(([letter, count]) => Array(count).fill(letter)));
}

function createLetterBag(usedLetters = []) {
  const bag = createFullLetterBag();
  for (const letter of usedLetters) {
    const index = bag.indexOf(letter);
    if (index >= 0) bag.splice(index, 1);
  }
  return shuffle(bag);
}

function topUpBag(bag, referenceLetters) {
  if (!bag.length) bag.push(...createLetterBag(referenceLetters));
}

function ensureMinimumVowels(letters, bag, minimum = 3, preferredIndexes = null) {
  let missing = minimum - letters.filter((letter) => VOWELS.has(letter)).length;
  if (missing <= 0) return;
  const preferred = preferredIndexes?.filter((index) => letters[index] && !VOWELS.has(letters[index])) ?? [];
  const fallback = letters.map((letter, index) => ({ letter, index }))
    .filter(({ letter, index }) => letter && !VOWELS.has(letter) && !preferred.includes(index))
    .map(({ index }) => index);
  const replaceable = [...preferred, ...fallback];
  while (missing > 0 && replaceable.length) {
    const vowelIndex = bag.findIndex((letter) => VOWELS.has(letter));
    if (vowelIndex < 0) break;
    const boardIndex = replaceable.shift();
    const [vowel] = bag.splice(vowelIndex, 1);
    bag.unshift(letters[boardIndex]);
    letters[boardIndex] = vowel;
    missing -= 1;
  }
}

const state = {
  uid: null,
  roomCode: null,
  room: null,
  players: [],
  selected: [],
  recentWords: [],
  combo: 0,
  submitting: false,
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
  quickStarting: false,
  matchmakingUnsubscriber: null,
  effects: [],
  blockedActive: false,
  rewarding: false,
  finishing: false,
  celebratedRound: null,
  lastTimerSecond: null,
  profileUnsubscriber: null,
  friendsUnsubscriber: null,
  inviteUnsubscriber: null,
  pendingInvite: null,
  roundHistory: [],
  roundRecap: null,
  roundRecapRound: null,
  roundHistoryRecorded: null,
  unsubscribers: [],
  timer: null,
  heartbeat: null,
  toastTimer: null
};

function showScreen(id) {
  for (const screen of screens) $(screen).classList.toggle("active", screen === id);
  ui.leaveButton.classList.toggle("hidden", !state.roomCode);
  const socialScreen = ["homeScreen", "marketScreen", "profileScreen"].includes(id);
  ui.bottomNav.classList.toggle("hidden", !socialScreen || !state.uid);
  ui.navPlay.classList.toggle("active", id === "homeScreen");
  ui.navMarket.classList.toggle("active", id === "marketScreen");
  ui.navProfile.classList.toggle("active", id === "profileScreen");
  enterScreen($(id));
  if (id === "marketScreen") renderMarket();
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
    document.documentElement.dataset.theme = state.activeTheme;
    ui.coinText.textContent = state.coins;
    ui.diamondText.textContent = state.diamonds;
    ui.profileName.textContent = state.profile?.displayName ?? "Oyuncu";
    ui.profileCode.textContent = state.profile?.friendCode ?? friendCode;
    ui.profileCoins.textContent = state.coins;
    ui.profileDiamonds.textContent = state.diamonds;
    ui.profileWins.textContent = state.wins;
    ui.profileLongestWord.textContent = state.profile?.longestWord
      ? state.profile.longestWord.toLocaleUpperCase("tr-TR")
      : "–";
    ui.profileBestWord.textContent = state.profile?.bestScoreWord
      ? `${state.profile.bestScoreWord.toLocaleUpperCase("tr-TR")} · +${state.profile.bestScore ?? 0}`
      : "–";
    ui.marketCoins.textContent = state.coins;
    ui.marketDiamonds.textContent = state.diamonds;
    ui.profileAvatar.src = state.profile?.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' rx='40' fill='%237c63ff'/%3E%3Ctext x='40' y='52' text-anchor='middle' fill='white' font-size='34'%3EW%3C/text%3E%3C/svg%3E";
    ui.coinBadge.classList.remove("hidden");
    ui.diamondBadge.classList.remove("hidden");
    ui.profileButton.classList.remove("hidden");
    renderAttackButton();
    renderMarket();
  });
  subscribeFriendships();
  subscribeInvite();
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

function renderFriends() {
  const accepted = state.friendships.filter((item) => item.status === "accepted");
  const requests = state.friendships.filter((item) => item.status === "pending" && item.requestedBy !== state.uid);
  ui.friendList.replaceChildren(...accepted.map((item) => {
    const person = friendIdentity(item);
    const row = document.createElement("div");
    row.className = "friend-row";
    row.innerHTML = "<span class=\"friend-dot\"></span><strong></strong>";
    row.querySelector("strong").textContent = person.name;
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
    row.append(name, accept);
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
  await updateDoc(doc(db, "friendships", id), { status: "accepted", updatedAt: serverTimestamp() });
  toast("Arkadaş eklendi.");
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
  if (!accepted.length) { toast("Önce arkadaş eklemelisin.", true); return; }
  ui.inviteFriendTargets.replaceChildren(...accepted.map((item) => {
    const person = friendIdentity(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attack-target";
    button.textContent = person.name;
    button.addEventListener("click", () => sendRoomInvite(person));
    return button;
  }));
  ui.invitePicker.classList.remove("hidden");
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
    ui.invitePicker.classList.add("hidden");
    toast(`${person.name} davet edildi.`);
  } catch (error) { toast(error.message, true); }
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
    card.innerHTML = `<div class="market-icon"></div><div class="market-copy"><strong></strong><span></span></div><div class="market-owned"></div><button type="button"></button>`;
    card.querySelector(".market-icon").textContent = item.icon;
    card.querySelector(".market-copy strong").textContent = item.title;
    card.querySelector(".market-copy span").textContent = item.description;
    card.querySelector(".market-owned").textContent = item.kind === "consumable" ? `x${amount}` : (equipped ? "KUŞANILDI" : (owned ? "SAHİP" : ""));
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
      button.textContent = missing ? `${missing} EKSİK` : `${item.currency === "coins" ? "◆" : "◇"} ${item.price}`;
      button.disabled = missing > 0;
      button.addEventListener("click", () => buyMarketItem(item, card));
    }
    return card;
  }));
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
  await updateDoc(profileRef(), { activeTheme: item.id, updatedAt: serverTimestamp() });
  document.documentElement.dataset.theme = item.id;
  purchaseFx(card.isConnected ? card : ui.marketGrid, "diamonds");
}

function setQuickMatchUi(active, text = "") {
  state.quickMatching = active;
  ui.quickMatchButton.textContent = active ? "ARAMAYI İPTAL ET" : "QUICK MATCH";
  ui.quickMatchStatus.textContent = text;
}

async function joinQuickRoom(code) {
  if (state.roomCode === code) return;
  const room = await getDoc(roomRef(code));
  if (!room.exists()) throw new Error("Eşleşme odası bulunamadı.");
  await setDoc(playerRef(state.uid, code), {
    name: state.profile?.displayName ?? auth.currentUser?.displayName ?? "Oyuncu",
    score: 0, words: 0, round: room.data().round ?? 0, letters: [], letterBag: [],
    boardVersion: 0, boardRound: -1, attackUsedRound: -1, rewardedRound: -1,
    ready: true, connected: true, lastSeenAt: serverTimestamp()
  }, { merge: true });
  state.matchmakingUnsubscriber?.();
  state.matchmakingUnsubscriber = null;
  setQuickMatchUi(false, "");
  await deleteDoc(doc(db, "matchmaking", state.uid)).catch(() => {});
  await enterRoom(code);
}

function watchMatchmaking() {
  state.matchmakingUnsubscriber?.();
  state.matchmakingUnsubscriber = onSnapshot(doc(db, "matchmaking", state.uid), async (snapshot) => {
    const data = snapshot.data();
    if (data?.status !== "matched" || !data.roomCode) return;
    try { await joinQuickRoom(data.roomCode); }
    catch (error) { toast(error.message, true); setQuickMatchUi(false, ""); }
  });
}

async function quickMatch() {
  if (state.quickMatching) {
    await deleteDoc(doc(db, "matchmaking", state.uid)).catch(() => {});
    state.matchmakingUnsubscriber?.();
    state.matchmakingUnsubscriber = null;
    setQuickMatchUi(false, "");
    return;
  }
  try {
    setQuickMatchUi(true, "Rakip aranıyor…");
    const ownQueueRef = doc(db, "matchmaking", state.uid);
    await setDoc(ownQueueRef, {
      uid: state.uid,
      name: state.profile?.displayName ?? "Oyuncu",
      photoURL: state.profile?.photoURL ?? "",
      status: "waiting",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    watchMatchmaking();
    const waiting = await getDocs(query(collection(db, "matchmaking"), where("status", "==", "waiting"), limit(8)));
    const candidate = waiting.docs.find((item) =>
      item.id !== state.uid && (item.data().updatedAt?.toMillis?.() ?? 0) > Date.now() - 30000
    );
    if (!candidate) return;
    const code = randomCode();
    const candidateRef = doc(db, "matchmaking", candidate.id);
    const roomDocument = roomRef(code);
    await runTransaction(db, async (transaction) => {
      const candidateSnapshot = await transaction.get(candidateRef);
      const roomSnapshot = await transaction.get(roomDocument);
      if (!candidateSnapshot.exists() || candidateSnapshot.data().status !== "waiting") throw new Error("Rakip başka bir maça katıldı.");
      if (roomSnapshot.exists()) throw new Error("Eşleşme kodu çakıştı. Tekrar dene.");
      transaction.set(roomDocument, {
        hostId: state.uid, phase: "lobby", round: 0, boardVersion: 0, maxPlayers: 2,
        quickMatch: true, letters: [], endsAt: null, winnerId: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      transaction.set(playerRef(state.uid, code), {
        name: state.profile?.displayName ?? "Oyuncu", score: 0, words: 0, round: 0,
        letters: [], letterBag: [], boardVersion: 0, boardRound: -1,
        attackUsedRound: -1, rewardedRound: -1, ready: true, connected: true,
        joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp()
      });
      transaction.update(candidateRef, { status: "matched", roomCode: code, matchedBy: state.uid, updatedAt: serverTimestamp() });
      transaction.update(ownQueueRef, { status: "matched", roomCode: code, matchedBy: state.uid, updatedAt: serverTimestamp() });
    });
    await joinQuickRoom(code);
  } catch (error) {
    if (state.quickMatching && /başka bir maça|kodu çakıştı/.test(error.message)) {
      ui.quickMatchStatus.textContent = "Rakip aranıyor…";
    } else {
      setQuickMatchUi(false, "");
      toast(error.message, true);
    }
  }
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
function profileRef(uid = state.uid) { return doc(db, "profiles", uid); }

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
  const bag = createFullLetterBag();
  const seed = randomSeedWord();
  const letters = [];
  for (const letter of [...seed.toLocaleUpperCase("tr-TR")]) {
    const index = bag.indexOf(letter);
    if (index >= 0 && letters.length < 12) letters.push(...bag.splice(index, 1));
  }
  while (letters.length < 12) letters.push(bag.pop());
  ensureMinimumVowels(letters, bag, 3);
  return shuffle(letters);
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
  try {
    setBusy(true);
    const code = cleanCode();
    await joinRoomByCode(code);
    track("room_join");
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); }
}

function persistRoomCode(code) {
  if (code) localStorage.setItem("wra-room-code", code);
  else localStorage.removeItem("wra-room-code");
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

async function enterRoom(code) {
  leaveListeners();
  persistRoomCode(code);
  state.roomCode = code;
  state.selected = [];
  state.recentWords = [];
  state.boardVersion = null;
  state.playerLetters = [];
  state.playerBag = null;
  state.boardInitializing = false;
  state.effects = [];
  state.blockedActive = false;
  state.finishing = false;
  state.roundHistory = [];
  state.roundRecap = null;
  state.roundRecapRound = null;
  state.roundHistoryRecorded = null;
  ui.attackPicker.classList.add("hidden");
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
    const nextBoardVersion = me?.boardVersion ?? 0;
    if (state.boardVersion !== null && nextBoardVersion !== state.boardVersion) state.selected = [];
    state.boardVersion = nextBoardVersion;
    state.playerLetters = me?.boardRound === (state.room?.round ?? 0) ? (me?.letters ?? []) : [];
    state.playerBag = me?.boardRound === (state.room?.round ?? 0) && Array.isArray(me?.letterBag) ? me.letterBag : null;
    renderPlayers();
    renderScores();
    renderStock();
    renderAttackButton();
    renderResults();
    if (state.room?.phase === "playing") ensurePlayerBoard();
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

function routeRoomPhase() {
  if (!state.room) return;
  if (state.room.phase === "lobby") {
    showScreen("lobbyScreen");
    syncMyRound();
    renderPlayers();
  } else if (state.room.phase === "playing") {
    showScreen("gameScreen");
    ensurePlayerBoard();
    renderLetters();
    renderAttackButton();
    startTimer();
  } else if (state.room.phase === "results") {
    clearInterval(state.timer);
    showScreen("resultsScreen");
    renderResults();
    awardRound();
    loadRoundRecap();
    recordRoundHistory();
  }
}

async function loadRoundRecap() {
  const round = state.room?.round ?? 0;
  if (state.roundRecapRound === round) return;
  state.roundRecapRound = round;
  try {
    const snapshot = await getDocs(query(collection(roomRef(), "submissions"), where("round", "==", round)));
    let longest = null;
    let topScore = null;
    for (const item of snapshot.docs) {
      const data = item.data();
      if (!longest || [...data.word].length > [...longest.word].length) longest = data;
      if (!topScore || data.points > topScore.points) topScore = data;
    }
    state.roundRecap = { round, longest, topScore, total: snapshot.size };
  } catch (error) {
    state.roundRecap = null;
  }
  renderResults();
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

async function ensurePlayerBoard() {
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

const LOW_STOCK_THRESHOLD = 8;

function renderStock() {
  const remaining = Array.isArray(state.playerBag) ? state.playerBag.length : null;
  ui.stockText.textContent = `KALAN ${remaining ?? "–"}`;
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
    ui.gameStatus.textContent = "A harflerin kilitlendi";
    attackFlash();
  } else if (changed && state.room?.phase === "playing") {
    ui.gameStatus.textContent = "Harfleri seç";
  }
  if (state.room?.phase === "playing") renderLetters();
}

function renderAttackButton() {
  if (!ui.attackButton) return;
  const me = state.players.find((player) => player.uid === state.uid);
  const used = me?.attackUsedRound === (state.room?.round ?? 0);
  const amount = state.inventory.a_lock ?? 0;
  ui.attackButton.textContent = used ? "KULLANILDI" : `A KİLİTLE · x${amount}`;
  ui.attackButton.disabled = state.room?.phase !== "playing" || used || amount < 1;
}

function openAttackPicker() {
  const me = state.players.find((player) => player.uid === state.uid);
  if ((state.inventory.a_lock ?? 0) < 1) { toast("Marketinden A Kilidi almalısın.", true); return; }
  if (me?.attackUsedRound === (state.room?.round ?? 0)) { toast("Bu tur engel kullandın.", true); return; }
  const opponents = state.players.filter((player) => player.uid !== state.uid);
  ui.attackTargets.replaceChildren(...opponents.map((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attack-target";
    button.textContent = player.name;
    button.addEventListener("click", () => useAttack(player.uid));
    return button;
  }));
  ui.attackPicker.classList.remove("hidden");
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
    ui.attackPicker.classList.add("hidden");
    toast("Rakibin A harfleri kilitlendi.");
    attackFlash();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderLetters() {
  const letters = activeLetters();
  ui.letterGrid.replaceChildren(...letters.map((letter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    const blocked = isLetterBlocked(letter);
    button.className = `letter-tile${state.selected.includes(index) ? " selected" : ""}${blocked ? " blocked" : ""}`;
    const glyph = document.createElement("span");
    glyph.className = "tile-letter";
    glyph.textContent = letter;
    const point = document.createElement("small");
    point.className = "tile-point";
    point.textContent = letter ? letterPoint(letter) : "";
    button.append(glyph, point);
    button.disabled = !letter || blocked;
    button.ariaLabel = blocked ? `${letter} harfi geçici olarak kilitli` : (letter ? `${letter} harfi, ${letterPoint(letter)} puan` : "Boş harf yuvası");
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); selectLetter(index); });
    return button;
  }));
  renderCurrentWord();
}

function selectLetter(index) {
  if (state.shuffling || !activeLetters()[index] || isLetterBlocked(activeLetters()[index]) || state.selected.includes(index) || state.room?.phase !== "playing") return;
  state.selected.push(index);
  haptic("tap");
  renderLetters();
  requestAnimationFrame(() => pressTile(ui.letterGrid.children[index]));
}

function currentWord() {
  const letters = activeLetters();
  return state.selected.map((index) => letters[index]).join("");
}

function renderCurrentWord() {
  const word = currentWord();
  ui.currentWord.textContent = "";
  if (word) ui.currentWord.textContent = word;
  else ui.currentWord.innerHTML = "<span>Harfleri seç</span>";
  ui.submitWordButton.disabled = !word || state.submitting || state.shuffling;
  ui.shuffleButton.disabled = state.submitting || state.shuffling;
}

function backspace() { state.selected.pop(); renderLetters(); }
function clearWord() { state.selected = []; renderLetters(); }

async function shuffleLetters() {
  if (state.shuffling || state.submitting || state.room?.phase !== "playing") return;
  const previousLetters = [...activeLetters()];
  if (previousLetters.length < 2) return;
  let nextLetters = shuffle(previousLetters);
  if (nextLetters.every((letter, index) => letter === previousLetters[index])) {
    nextLetters = [...previousLetters.slice(1), previousLetters[0]];
  }
  state.shuffling = true;
  state.selected = [];
  state.playerLetters = nextLetters;
  ui.shuffleButton.disabled = true;
  renderLetters();
  haptic("tap");
  requestAnimationFrame(() => {
    for (const tile of ui.letterGrid.children) pressTile(tile);
  });
  try {
    await updateDoc(playerRef(), {
      letters: nextLetters,
      boardRound: state.room.round ?? 0,
      boardVersion: increment(1),
      lastSeenAt: serverTimestamp()
    });
    state.boardVersion = (state.boardVersion ?? 0) + 1;
  } catch (error) {
    state.playerLetters = previousLetters;
    renderLetters();
    toast("Harfler karıştırılamadı.", true);
  } finally {
    state.shuffling = false;
    ui.shuffleButton.disabled = false;
  }
}

function pointsFor(word) {
  const letters = [...word.toLocaleUpperCase("tr-TR")];
  const letterTotal = letters.reduce((total, letter) => total + letterPoint(letter), 0);
  const lengthMultiplier = letters.length <= 3
    ? 1
    : letters.length === 4
      ? 1.25
      : letters.length === 5
        ? 1.5
        : letters.length === 6
          ? 1.75
          : 2;
  const comboMultiplier = 1 + Math.min(state.combo, 5) * .1;
  return Math.round(letterTotal * lengthMultiplier * comboMultiplier);
}

async function submitWord() {
  if (state.submitting || state.shuffling) return;
  const displayed = currentWord();
  const selectedIndexes = [...state.selected];
  const word = normalizeWord(displayed);
  if ([...word].length < 2) { invalidWord(ui.currentWord); toast("Kelime çok kısa.", true); return; }
  if (!isValidWord(word)) { state.combo = 0; invalidWord(ui.currentWord); toast("Bu kelime sözlükte yok.", true); return; }
  if (!Array.isArray(state.playerBag)) { toast("Harf stoğu hazırlanıyor.", true); return; }
  const submittedAtMs = Date.now();
  const points = pointsFor(word);
  const previousLetters = [...activeLetters()];
  const previousBag = [...state.playerBag];
  const optimisticLetters = [...previousLetters];
  const optimisticBag = [...previousBag];
  for (const index of selectedIndexes) {
    topUpBag(optimisticBag, optimisticLetters);
    optimisticLetters[index] = optimisticBag.pop();
  }
  ensureMinimumVowels(optimisticLetters, optimisticBag, 3, selectedIndexes);
  state.submitting = true;
  state.playerLetters = optimisticLetters;
  state.playerBag = optimisticBag;
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
      const currentRoom = await transaction.get(roomRef());
      if (!currentRoom.exists() || currentRoom.data().phase !== "playing") throw new Error("Tur sona erdi.");
      if (currentRoom.data().endsAt.toMillis() <= submittedAtMs) throw new Error("Süre doldu.");
      const roomData = currentRoom.data();
      const currentPlayer = await transaction.get(playerRef());
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
      const submissionRef = doc(roomRef(), "submissions", `r${round}_${word}`);
      if ((await transaction.get(submissionRef)).exists()) throw new Error("Bu kelime daha önce bulundu.");
      const profileSnapshot = await transaction.get(profileRef());
      const nextLetters = [...liveLetters];
      for (const index of selectedIndexes) {
        topUpBag(liveBag, nextLetters);
        nextLetters[index] = liveBag.pop();
      }
      ensureMinimumVowels(nextLetters, liveBag, 3, selectedIndexes);
      refreshedLetters = nextLetters;
      refreshedBag = liveBag;
      transaction.set(submissionRef, { word, ownerId: state.uid, points, round, createdAt: serverTimestamp() });
      transaction.update(playerRef(), {
        letters: nextLetters,
        letterBag: liveBag,
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
          transaction.update(profileRef(), { ...profileUpdate, updatedAt: serverTimestamp() });
        }
      }
    });
    state.playerLetters = refreshedLetters ?? state.playerLetters;
    state.playerBag = refreshedBag ?? state.playerBag;
    state.combo += 1;
    state.recentWords.unshift(word);
    state.recentWords = state.recentWords.slice(0, 6);
    ui.gameStatus.textContent = `${displayed} kabul edildi · +${points}`;
    ui.comboText.textContent = state.combo > 1 ? `x${state.combo} SERİ` : "";
    ui.recentWords.replaceChildren(...state.recentWords.map((item) => { const chip = document.createElement("span"); chip.className = "word-chip"; chip.textContent = item; return chip; }));
    renderLetters();
    renderStock();
    requestAnimationFrame(() => {
      acceptedWord(ui.currentWord, points, []);
      comboPop(ui.comboText, state.combo);
    });
    track("word_accepted", { length: [...word].length, points });
  } catch (error) {
    state.playerLetters = previousLetters;
    state.playerBag = previousBag;
    state.boardVersion = Math.max(0, (state.boardVersion ?? 1) - 1);
    state.selected = [];
    renderLetters();
    renderStock();
    invalidWord(ui.currentWord);
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
    if (remaining !== state.lastTimerSecond) {
      state.lastTimerSecond = remaining;
      timerPulse(ui.timerText, remaining);
    }
    refreshBlockedLetters();
    if (
      end && Date.now() >= end + ROUND_GRACE_MS &&
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
  state.timer = setInterval(tick, 250);
}

async function toggleReady() {
  await updateDoc(playerRef(), { ready: !state.ready, lastSeenAt: serverTimestamp() });
  haptic("tap");
}

async function maybeStartQuickMatch() {
  if (
    state.quickStarting || !state.room?.quickMatch || state.room.phase !== "lobby" ||
    state.room.hostId !== state.uid || state.players.length !== 2 ||
    state.players.some((player) => !player.ready)
  ) return;
  state.quickStarting = true;
  try { await startMatch(); }
  finally { state.quickStarting = false; }
}

async function startMatch() {
  const players = state.players.map(currentRoundPlayer);
  if (state.room?.hostId !== state.uid || players.length < 2 || players.some((player) => !player.ready)) return;
  state.finishing = false;
  state.lastTimerSecond = null;
  await updateDoc(roomRef(), {
    phase: "playing", letters: createLetters(), boardVersion: increment(1), winnerId: null,
    endsAt: Timestamp.fromMillis(Date.now() + 75000), updatedAt: serverTimestamp()
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
  renderRoundRecap();
  renderSeriesRecap();
}

function playerName(uid) {
  return state.players.find((player) => player.uid === uid)?.name ?? "Oyuncu";
}

function renderRoundRecap() {
  if (!ui.roundRecap) return;
  const recap = state.roundRecap;
  const active = recap && recap.round === (state.room?.round ?? 0) && (recap.longest || recap.topScore);
  ui.roundRecap.classList.toggle("hidden", !active);
  if (!active) return;
  ui.recapLongest.textContent = recap.longest
    ? `${recap.longest.word.toLocaleUpperCase("tr-TR")} · ${playerName(recap.longest.ownerId)}`
    : "–";
  ui.recapTopScore.textContent = recap.topScore
    ? `${recap.topScore.word.toLocaleUpperCase("tr-TR")} · +${recap.topScore.points} · ${playerName(recap.topScore.ownerId)}`
    : "–";
  ui.recapTotal.textContent = `${recap.total} kelime bulundu`;
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
  const round = state.room?.round ?? 0;
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
  if (state.room?.phase === "results" && state.celebratedRound !== round) {
    state.celebratedRound = round;
    requestAnimationFrame(() => celebrate(ui.winnerText, diamondBonus));
  }
}

async function rematch() {
  if (state.room?.hostId !== state.uid) return;
  await updateDoc(roomRef(), {
    phase: "lobby", round: increment(1), letters: [], endsAt: null, winnerId: null, updatedAt: serverTimestamp()
  });
  state.combo = 0;
  state.recentWords = [];
  state.finishing = false;
  ui.rewardText.textContent = "";
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
  persistRoomCode(null);
  Object.assign(state, {
    roomCode: null, room: null, players: [], selected: [], recentWords: [], combo: 0, ready: false,
    boardVersion: null, playerLetters: [], playerBag: null, boardInitializing: false,
    effects: [], blockedActive: false, rewarding: false, finishing: false,
    roundHistory: [], roundRecap: null, roundRecapRound: null, roundHistoryRecorded: null
  });
  ui.attackPicker.classList.add("hidden");
  showScreen("homeScreen");
}

function setBusy(value) {
  ui.createRoomButton.disabled = value;
  ui.joinRoomButton.disabled = value;
}

async function googleLogin() {
  try {
    if (auth.currentUser?.isAnonymous) await linkWithPopup(auth.currentUser, googleProvider);
    else await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (["auth/popup-blocked", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(error.code)) {
      if (auth.currentUser?.isAnonymous) await linkWithRedirect(auth.currentUser, googleProvider);
      else await signInWithRedirect(auth, googleProvider);
      return;
    }
    const message = error.code === "auth/credential-already-in-use"
      ? "Bu Google hesabının mevcut profili var. Önce çıkış yaparak Google ile gir."
      : "Google girişi açılamadı.";
    toast(message, true);
  }
}

async function guestLogin() {
  try { await signInAnonymously(auth); }
  catch (error) { toast("Misafir oturumu açılamadı.", true); }
}

async function logout() {
  if (state.roomCode) await leaveRoom();
  if (state.quickMatching && state.uid) {
    await deleteDoc(doc(db, "matchmaking", state.uid)).catch(() => {});
  }
  state.profileUnsubscriber?.();
  state.friendsUnsubscriber?.();
  state.inviteUnsubscriber?.();
  state.matchmakingUnsubscriber?.();
  hideInviteBanner();
  await signOut(auth);
}

ui.createRoomButton.addEventListener("click", createRoom);
ui.joinRoomButton.addEventListener("click", joinRoom);
ui.googleLoginButton.addEventListener("click", googleLogin);
ui.guestLoginButton.addEventListener("click", guestLogin);
ui.logoutButton.addEventListener("click", logout);
ui.quickMatchButton.addEventListener("click", quickMatch);
ui.profileButton.addEventListener("click", () => showScreen("profileScreen"));
ui.profileBackButton.addEventListener("click", () => showScreen("homeScreen"));
ui.marketBackButton.addEventListener("click", () => showScreen("homeScreen"));
ui.navPlay.addEventListener("click", () => showScreen("homeScreen"));
ui.navMarket.addEventListener("click", () => showScreen("marketScreen"));
ui.navProfile.addEventListener("click", () => showScreen("profileScreen"));
ui.soundToggle.addEventListener("click", () => {
  const enabled = setSound(!isSoundEnabled());
  ui.soundToggle.textContent = enabled ? "SES AÇIK" : "SES KAPALI";
});
ui.addFriendButton.addEventListener("click", addFriend);
ui.friendCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") addFriend(); });
ui.roomCodeInput.addEventListener("input", () => { ui.roomCodeInput.value = ui.roomCodeInput.value.replace(/\D/g, "").slice(0, 5); });
ui.roomCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinRoom(); });
ui.copyCodeButton.addEventListener("click", copyCode);
ui.readyButton.addEventListener("click", toggleReady);
ui.startButton.addEventListener("click", startMatch);
ui.attackButton.addEventListener("click", openAttackPicker);
ui.closeAttackButton.addEventListener("click", () => ui.attackPicker.classList.add("hidden"));
ui.inviteFriendButton.addEventListener("click", openInvitePicker);
ui.closeInviteButton.addEventListener("click", () => ui.invitePicker.classList.add("hidden"));
ui.inviteJoinButton.addEventListener("click", acceptInvite);
ui.inviteDismissButton.addEventListener("click", dismissInvite);
ui.shuffleButton.addEventListener("click", shuffleLetters);
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
ui.soundToggle.textContent = isSoundEnabled() ? "SES AÇIK" : "SES KAPALI";
initEffects(ui.effectsCanvas);
onAuthStateChanged(auth, async (user) => {
  const signedIn = Boolean(user);
  const guest = Boolean(user?.isAnonymous);
  ui.googleLoginButton.classList.toggle("hidden", signedIn && !guest);
  ui.googleLoginButton.innerHTML = `<span>G</span> ${guest ? "GOOGLE'A BAĞLA" : "GOOGLE İLE GİRİŞ"}`;
  ui.guestLoginButton.classList.toggle("hidden", signedIn);
  ui.logoutButton.classList.toggle("hidden", !signedIn);
  ui.createRoomButton.disabled = !signedIn;
  ui.joinRoomButton.disabled = !signedIn;
  ui.quickMatchButton.disabled = !signedIn;
  if (!signedIn) {
    state.uid = null;
    ui.coinBadge.classList.add("hidden");
    ui.diamondBadge.classList.add("hidden");
    ui.profileButton.classList.add("hidden");
    setConnection("offline", "Giriş gerekli");
    showScreen("homeScreen");
    return;
  }
  state.uid = user.uid;
  try {
    await dictionaryReady;
    await ensureProfile(user);
  }
  catch (error) { toast(error.message, true); return; }
  ui.playerName.value = user.displayName ?? state.profile?.displayName ?? localStorage.getItem("wra-player-name") ?? "";
  setConnection("online", guest ? "Misafir" : "Çevrimiçi");
  const savedRoomCode = localStorage.getItem("wra-room-code");
  const resumed = savedRoomCode ? await resumeRoom(savedRoomCode) : false;
  if (!resumed) showScreen("homeScreen");
  track("app_ready");
});

getRedirectResult(auth).catch(() => toast("Google giriş yönlendirmesi tamamlanamadı.", true));
