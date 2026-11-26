// Service worker : l'application et le dernier snapshot restent disponibles hors ligne.
const CACHE = "marche-brief-v1";
const SCOPE = self.registration.scope;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE, `${SCOPE}data/snapshot.json`]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || !req.url.startsWith(SCOPE)) return; // l'API du Worker n'est jamais mise en cache

  // Données et pages : réseau d'abord, cache si hors ligne.
  if (url.pathname.includes("/data/") || req.mode === "navigate") {
    const key = url.pathname.includes("/data/") ? new Request(url.origin + url.pathname) : req;
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key).then((r) => r || caches.match(SCOPE)))
    );
    return;
  }
  // Fichiers statiques (JS, CSS, icônes) : cache d'abord, mis à jour en arrière-plan.
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
