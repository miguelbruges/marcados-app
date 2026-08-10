// v2: antes esto era "cache-first" para el shell — server nuevo desplegado,
// pero el navegador seguía sirviendo para siempre los archivos viejos que
// ya tenía guardados, sin enterarse nunca de las actualizaciones (bug real,
// no solo un caso de "hacé un refresco forzado"). Ahora es "red primero,
// caché solo como respaldo sin conexión": cada despliegue se ve enseguida
// apenas hay internet, y igual sigue funcionando si el celular se queda
// sin señal en medio de una reunión.
const CACHE = "marcados-shell-v2";
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

// Las llamadas a la API (/personas, /asistencia, etc.) siempre van a red
// directo — nunca se sirven datos de personas desde caché, ni siquiera
// como respaldo (si no hay conexión, tiene que fallar visiblemente, no
// mostrar datos viejos como si fueran los actuales). Se distinguen del
// shell por 'destination': las llamadas fetch() de api.js llegan con
// destination "" (vacío), nunca "document"/"script"/"style"/"manifest".
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (!["document", "script", "style", "manifest"].includes(request.destination)) return;

  event.respondWith(
    fetch(request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copia));
        return resp;
      })
      .catch(() => caches.match(request))
  );
});
