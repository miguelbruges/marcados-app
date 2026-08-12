const Router = (() => {
  const rutas = {};
  // Se incrementa en cada navegación — permite que un handler async, al
  // volver de un await, detecte que el usuario ya se fue a otra pantalla y
  // no siga escribiendo sobre un DOM que ya no existe (causaba
  // "Cannot set properties of null" cuando la carga era lenta).
  let navToken = 0;

  function on(ruta, handler) {
    rutas[ruta] = handler;
  }

  function actual() {
    const hash = location.hash.replace(/^#/, "") || "/login";
    return hash.split("?")[0]; // el query string no forma parte de la ruta
  }

  function query() {
    const [, qs] = location.hash.split("?");
    return new URLSearchParams(qs || "");
  }

  function resolver() {
    navToken++;
    const ruta = actual();
    const handler = rutas[ruta] || rutas["/404"];
    document.querySelectorAll("#tabbar a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === `#${ruta}`);
    });
    handler?.();
  }

  window.addEventListener("hashchange", resolver);
  window.addEventListener("DOMContentLoaded", resolver);

  return {
    on,
    resolver,
    query,
    navegar: (ruta) => (location.hash = `#${ruta}`),
    token: () => navToken,
    vigente: (miToken) => miToken === navToken,
  };
})();
