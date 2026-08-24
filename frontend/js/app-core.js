const $app = document.getElementById("app");
const $tabbar = document.getElementById("tabbar");
const $btnSalir = document.getElementById("btn-salir");
const $btnAdminGear = document.getElementById("btn-admin-gear");
const $btnAlertas = document.getElementById("btn-alertas");

// --- Instalar como app: para que el equipo de consolidación pueda abrir
// MARCADOS desde su pantalla de inicio como una app real, no un enlace
// más en el navegador (pedido del usuario, 2026-08-12). En Android/Chrome
// se puede disparar el diálogo de instalación desde acá; en iPhone Safari
// no existe esa API — solo se puede explicar el paso manual. ---
(function inicializarBannerInstalar() {
  const LS_KEY = "marcados_banner_instalar_oculto";
  if (localStorage.getItem(LS_KEY)) return;

  const yaInstalada =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (yaInstalada) return;

  const $banner = document.getElementById("banner-instalar");
  const $texto = document.getElementById("banner-instalar-texto");
  const $btnInstalar = document.getElementById("btn-instalar");
  const $btnCerrar = document.getElementById("btn-instalar-cerrar");
  if (!$banner) return;

  function ocultar() {
    $banner.hidden = true;
    localStorage.setItem(LS_KEY, "1");
  }
  $btnCerrar.addEventListener("click", ocultar);

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (esIOS) {
    $texto.textContent = 'Para instalarla: tocá "Compartir" en Safari y elegí "Agregar a inicio".';
    $banner.hidden = false;
    return;
  }

  let promptDiferido = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptDiferido = e;
    $btnInstalar.hidden = false;
    $banner.hidden = false;
  });

  $btnInstalar.addEventListener("click", async () => {
    if (!promptDiferido) return;
    $banner.hidden = true;
    promptDiferido.prompt();
    await promptDiferido.userChoice;
    promptDiferido = null;
    localStorage.setItem(LS_KEY, "1");
  });

  window.addEventListener("appinstalled", () => localStorage.setItem(LS_KEY, "1"));
})();

// Política de acceso (definida por el usuario, 2026-08-10): el seguimiento
// pastoral y el semáforo de asistencia son solo para líderes y encargados
// de área — no para todo el equipo de consolidación. El backend ya lo
// exige (403 si no corresponde); acá solo evitamos mostrar una sección que
// de todas formas fallaría, y evitamos el pedido HTTP que sabemos que va a
// dar 403.
function tieneAccesoPastoral() {
  return ["admin", "lider", "encargado"].includes(Api.rol());
}

function requiereSesion() {
  if (!Api.isAuthenticated()) {
    Router.navegar("/login");
    return false;
  }
  $tabbar.hidden = false;
  $btnSalir.hidden = false;
  return true;
}

$btnSalir.addEventListener("click", () => {
  Api.logout();
  $tabbar.hidden = true;
  $btnSalir.hidden = true;
  $btnAdminGear.hidden = true;
  $btnAlertas.hidden = true;
  Router.navegar("/login");
});

$btnAlertas.addEventListener("click", () => Router.navegar("/alertas"));

// Cuenta cuántas cosas hay para revisar (semáforo en rojo + fichas
// incompletas + seguimientos "requiere atención") y lo muestra como
// contador sobre la campanita — todo agregado de datos que ya existían,
// nunca una conclusión nueva (pedido del usuario, 2026-08-12).
async function actualizarBadgeAlertas() {
  if (!tieneAccesoPastoral()) {
    $btnAlertas.hidden = true;
    return;
  }
  $btnAlertas.hidden = false;
  try {
    const [rojos, incompletas, atencion] = await Promise.all([
      Api.alertasDetalle("rojo"),
      Api.fichasIncompletas(),
      Api.seguimientosRequierenAtencion(),
    ]);
    const total = rojos.length + incompletas.length + atencion.length;
    const badge = document.getElementById("badge-alertas");
    badge.hidden = total === 0;
    badge.textContent = total > 99 ? "99+" : String(total);
  } catch (e) {
    // silencioso: si falla, el botón sigue llevando a /alertas igual.
  }
}

// --- Botón de atrás: mismo componente en todas las subpáginas (pedido del
// usuario, 2026-08-11) — antes cada página tenía su propio enlace suelto. ---
function botonAtras(destino, texto) {
  return `
    <a class="boton-atras" href="#${destino}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      ${texto}
    </a>
  `;
}

// --- Ficha completa: badge de completitud (sección 17 del handoff) ---
function nivelFicha(pct) {
  if (pct >= 85) return "ALTA";
  if (pct >= 70) return "MEDIA";
  return "BAJA";
}

function badgeFicha(p) {
  if (p.ficha_completa_pct === undefined) return "";
  return `<span class="badge ${nivelFicha(p.ficha_completa_pct)}">${p.ficha_completa_pct}% ficha</span>`;
}

function normalizarTexto(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// --- Selector de actividad, con soporte para "Otro" (texto libre) ---
function opcionesActividades(actividades) {
  return actividades.map((a) => `<option value="${a.id}" data-nombre="${a.nombre}">${a.nombre}</option>`).join("");
}

// Cualquier actividad cuyo nombre arranque con "Otro" cuenta como la
// opción de texto libre. Antes esto comparaba contra "Otro" exacto y en
// producción la actividad se llama "Otro / Evento esporádico" (la
// migración que iba a renombrarla se saltea si ya existe una llamada
// "Otro") — así que el campo para escribir el nombre a mano no aparecía
// nunca, ni en Registrar asistencia ni en Importar lista (bug reportado
// por el usuario, 2026-08-24).
function esOtroSeleccionado(selectId) {
  const opt = document.getElementById(selectId).selectedOptions[0];
  if (!opt) return false;
  return (opt.dataset.nombre || "").trim().toLowerCase().startsWith("otro");
}

function wireOtroManual(selectId, slotId) {
  const select = document.getElementById(selectId);
  const slot = document.getElementById(slotId);
  function actualizar() {
    slot.innerHTML = esOtroSeleccionado(selectId)
      ? `<label>¿Cuál evento?</label><input type="text" id="${selectId}-otro-texto" placeholder="Nombre del evento...">`
      : "";
  }
  select.addEventListener("change", actualizar);
  actualizar();
}

function nombreEventoElegido(selectId) {
  const opt = document.getElementById(selectId).selectedOptions[0];
  const otroInput = document.getElementById(`${selectId}-otro-texto`);
  if (esOtroSeleccionado(selectId) && otroInput && otroInput.value.trim()) {
    return otroInput.value.trim();
  }
  return opt ? opt.dataset.nombre : "Evento";
}

