const Router = (() => {
  const rutas = {};

  function on(ruta, handler) {
    rutas[ruta] = handler;
  }

  function actual() {
    return location.hash.replace(/^#/, "") || "/login";
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

  return { on, resolver, navegar: (ruta) => (location.hash = `#${ruta}`) };
})();
