// Offline support: the app shell and dictionary are cached so the bot mode
// works without a connection. Firebase SDK files are versioned URLs and are
// cached after first use; Firestore/Auth API traffic is never intercepted.
const VERSION = "wra-v2.0.0";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "game-core.js", "words.js", "effects.js",
  "auth-flow.js", "firebase-config.js", "tr_words.txt", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];
const SDK_PREFIX = "https://www.gstatic.com/firebasejs/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    if (request.mode === "navigate") return (await cache.match("index.html")) ?? Response.error();
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached ?? (await refresh) ?? Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.href.startsWith(SDK_PREFIX)) { event.respondWith(cacheFirst(request)); return; }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/__/")) return;
  // Code must stay version-consistent across modules, so prefer the network
  // and fall back to the cache only when offline.
  if (request.mode === "navigate" || /\.(js|css|webmanifest)$/.test(url.pathname)) { event.respondWith(networkFirst(request)); return; }
  event.respondWith(staleWhileRevalidate(request));
});
