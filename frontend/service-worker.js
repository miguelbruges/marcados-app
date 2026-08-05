const CACHE = "marcados-shell-v1";
const SHELL = [
  "./index.html",
  "./css/styles.css",
  "./js/api.js",
  "./js/matching-ui.js",
  "./js/router.js",
  "./js/app.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Solo cachea el shell estático. Las llamadas a la API (/personas, /asistencia,
// etc.) siempre van a red — nunca se sirven datos de personas desde caché.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
