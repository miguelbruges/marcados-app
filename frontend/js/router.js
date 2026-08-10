const Router = (() => {
  const rutas = {};

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
    const ruta = actual();
    const handler = rutas[ruta] || rutas["/404"];
    document.querySelectorAll("#tabbar a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === `#${ruta}`);
    });
    handler?.();
  }

  window.addEventListener("hashchange", resolver);
  window.addEventListener("DOMContentLoaded", resolver);

  return { on, resolver, query, navegar: (ruta) => (location.hash = `#${ruta}`) };
})();
