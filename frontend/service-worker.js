// v2: antes esto era "cache-first" para el shell — server nuevo desplegado,
// pero el navegador seguía sirviendo para siempre los archivos viejos que
// ya tenía guardados, sin enterarse nunca de las actualizaciones (bug real,
// no solo un caso de "hacé un refresco forzado"). Ahora es "red primero,
// caché solo como respaldo sin conexión": cada despliegue se ve enseguida
// apenas hay internet, y igual sigue funcionando si el celular se queda
// sin señal en medio de una reunión.
// v3: app.js se separó en varios archivos por pantalla (auditoría
// 2026-08-14) — el nombre de caché cambió para que el navegador no se
// quede pegado con el SHELL viejo, que listaba "./js/app.js" (ya no
// existe; cache.addAll() falla entero si un solo archivo de la lista da
// 404, así que esto no era opcional).
// v5: index.html pasa a pedir el CSS y los JS con ?v=N (2026-08-24). Sin eso
// el navegador reusaba la copia que ya tenía y no se enteraba del despliegue
// nuevo: un cambio ya subido y verificado seguía sin verse en el celular.
// TIENE QUE COINCIDIR con el ?v= de index.html — si difieren, el service
// worker precachea URLs que la página nunca pide y el respaldo sin conexión
// deja de servir.
const VERSION = "5";
const CACHE = `marcados-shell-v${VERSION}`;
const SHELL = [
  "./index.html",
  `./css/styles.css?v=${VERSION}`,
  `./js/api.js?v=${VERSION}`,
  `./js/matching-ui.js?v=${VERSION}`,
  `./js/router.js?v=${VERSION}`,
  `./js/app-core.js?v=${VERSION}`,
  `./js/app-panel.js?v=${VERSION}`,
  `./js/app-admin.js?v=${VERSION}`,
  `./js/app-personas.js?v=${VERSION}`,
  `./js/app-asistencia.js?v=${VERSION}`,
  `./js/app-bootstrap.js?v=${VERSION}`,
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
