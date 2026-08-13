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

// --- Login ---
Router.on("/login", () => {
  $tabbar.hidden = true;
  $btnSalir.hidden = true;
  $btnAdminGear.hidden = true;
  $btnAlertas.hidden = true;
  $app.innerHTML = `
    <h1>Ingresar</h1>
    <form id="form-login">
      <label>Email</label>
      <input type="email" id="login-email" required autocomplete="username"
             autocapitalize="off" autocorrect="off" spellcheck="false">
      <label>Contraseña</label>
      <input type="password" id="login-password" required autocomplete="current-password"
             autocapitalize="off" autocorrect="off" spellcheck="false">
      <button class="primary" type="submit">Entrar</button>
      <div class="error" id="login-error"></div>
      <label class="check-label" id="login-toggle-ver"><input type="checkbox" id="login-ver-clave"> Mostrar contraseña</label>
    </form>
  `;
  document.getElementById("login-ver-clave").addEventListener("change", (e) => {
    document.getElementById("login-password").type = e.target.checked ? "text" : "password";
  });

  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorBox = document.getElementById("login-error");
    errorBox.textContent = "";
    try {
      const { access_token, rol, nombre } = await Api.login(email, password);
      Api.setSession(access_token, rol, nombre);
      Router.navegar("/panel");
    } catch (e2) {
      console.error("Error de login:", e2);
      errorBox.textContent = e2.message || "No se pudo iniciar sesión.";
    }
  });
});

// --- Panel ---
Router.on("/panel", async () => {
  if (!requiereSesion()) return;
  const miToken = Router.token();
  const esAdmin = Api.rol() === "admin";
  $btnAdminGear.hidden = !esAdmin;

  $app.innerHTML = `
    <h1>Hola, ${Api.nombre()}</h1>
    <div class="buscador-general" id="buscador-panel-slot"></div>
    <div class="grid-kpi" id="grid-kpi"></div>
    <div id="semaforo-slot"></div>
  `;

  const buscador = crearBuscadorPersonas({
    placeholder: "Buscar joven por nombre...",
    onSeleccionar: (candidato) => Router.navegar(`/personas/ver?id=${candidato.persona_id}`),
  });
  document.getElementById("buscador-panel-slot").appendChild(buscador);

  async function cargarKpis() {
    try {
      const [resumen, activosCrudo, inactivosCrudo, bautizados30d] = await Promise.all([
        Api.dashboardResumen(),
        Api.personas(true),
        Api.personas(false),
        Api.asistieron30Dias(),
      ]);
      if (!Router.vigente(miToken)) return;
      // PersonaOut no trae nombre_completo (solo nombres/apellidos por separado) —
      // se completa acá para que las listas de las tarjetas puedan mostrar un nombre.
      const conNombreCompleto = (p) => ({ ...p, nombre_completo: `${p.nombres} ${p.apellidos}` });
      const activos = activosCrudo.map(conNombreCompleto);
      const inactivos = inactivosCrudo.map(conNombreCompleto);
      const todas = activos.concat(inactivos);
      pintarKpis([
        { label: "Total jóvenes", valor: resumen.total_jovenes, personas: todas, etiqueta: (p) => (p.activo ? "activo" : "inactivo"), filtro: null },
        { label: "Activos", valor: resumen.activos, personas: todas.filter((p) => p.activo_ministerio), etiqueta: () => "activo", vacioTexto: "Nadie confirmado como activo todavía — se marca desde la ficha de cada joven.", filtro: "activos" },
        { label: "Bautizados", valor: resumen.bautizados, personas: todas.filter((p) => p.bautizado), etiqueta: () => "bautizado", filtro: "bautizados" },
        { label: "Sirviendo", valor: resumen.sirviendo, personas: todas.filter((p) => p.servidor), etiqueta: () => "servidor", filtro: "servidores" },
        { label: "Asistieron · 30 días", valor: resumen.asistieron_ultimos_30_dias, personas: bautizados30d, etiqueta: () => "asistió", vacioTexto: "Nadie todavía en los últimos 30 días.", filtro: "asistio30" },
      ]);
    } catch (e) {
      if (!Router.vigente(miToken)) return;
      document.getElementById("grid-kpi").innerHTML = `<div class="error">${e.message}</div>`;
    }
  }

  // Las tres cargas del panel no dependen entre sí — antes se esperaban en
  // cadena (KPIs, después semáforo, después el contador de alertas), lo
  // que sumaba sus tiempos de red uno tras otro. Ahora arrancan todas
  // juntas (pedido del usuario, 2026-08-12: "no quiero que demoren").
  if (tieneAccesoPastoral()) {
    await Promise.all([cargarKpis(), cargarSemaforo(30), actualizarBadgeAlertas()]);
  } else {
    $btnAlertas.hidden = true;
    await cargarKpis();
  }
});

// --- Semáforo de asistencia: período configurable + pastillas que se abren
// para mostrar quiénes están detrás del número (pedido del usuario, 2026-08-11) ---
const PERIODOS_SEMAFORO = [7, 15, 30, 60, 90];
let semaforoNivelAbierto = null;

async function cargarSemaforo(ventanaDias) {
  const slot = document.getElementById("semaforo-slot");
  if (!slot) return;
  const miToken = Router.token();
  semaforoNivelAbierto = null;
  slot.innerHTML = `<p class="hint">Cargando semáforo...</p>`;
  try {
    const a = await Api.alertasResumen(ventanaDias);
    if (!Router.vigente(miToken)) return;
    slot.innerHTML = `
      <div class="card semaforo">
        <h2 style="margin-top:0">Semáforo de asistencia</h2>
        <p class="aclaracion">
          Se calcula sobre los <strong>Encuentro Marcados</strong> del período: Verde = 85% o más de asistencia,
          Amarillo = entre 50% y 84%, Rojo = menos de 50%. "Sin datos" significa que en este período todavía no
          hubo al menos 2 Encuentros para poder calcular algo confiable — no que a alguien le falte historial.
          Alerta operativa, no una conclusión pastoral — la decisión siempre la toma una persona. Tocá un color
          para ver quiénes son.
        </p>
        <div class="periodo-chips">
          ${PERIODOS_SEMAFORO.map(
            (d) => `<button type="button" class="chip-periodo ${d === ventanaDias ? "activo" : ""}" data-dias="${d}">${d} días</button>`
          ).join("")}
        </div>
        <div class="pastillas">
          ${pastilla("verde", a.verde, "Verde", "verde")}
          ${pastilla("amarillo", a.amarillo, "Amarillo", "amarillo")}
          ${pastilla("rojo", a.rojo, "Rojo", "rojo")}
          ${pastilla("gris", a.sin_datos, "Sin datos", "sin_datos")}
        </div>
        <div id="semaforo-detalle"></div>
      </div>
    `;
    slot.querySelectorAll(".chip-periodo").forEach((btn) => {
      btn.addEventListener("click", () => cargarSemaforo(Number(btn.dataset.dias)));
    });
    slot.querySelectorAll("button.pastilla").forEach((btn) => {
      btn.addEventListener("click", () => alternarDetalleSemaforo(btn, ventanaDias));
    });
  } catch (e) {
    if (!Router.vigente(miToken)) return;
    slot.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

async function alternarDetalleSemaforo(btn, ventanaDias) {
  const nivel = btn.dataset.nivel;
  const detalle = document.getElementById("semaforo-detalle");
  const slot = document.getElementById("semaforo-slot");
  if (semaforoNivelAbierto === nivel) {
    semaforoNivelAbierto = null;
    detalle.innerHTML = "";
    slot.querySelectorAll("button.pastilla").forEach((b) => b.setAttribute("aria-expanded", "false"));
    return;
  }
  semaforoNivelAbierto = nivel;
  slot.querySelectorAll("button.pastilla").forEach((b) => b.setAttribute("aria-expanded", String(b === btn)));
  detalle.innerHTML = `<p class="hint">Cargando...</p>`;
  try {
    const personas = await Api.alertasDetalle(nivel, ventanaDias);
    detalle.innerHTML = personas.length
      ? `<ul class="kpi-lista">${personas.map((p) => `<li><a href="#/personas/ver?id=${p.id}">${p.nombre_completo}</a></li>`).join("")}</ul>`
      : `<p class="hint">Nadie en este nivel por ahora.</p>`;
  } catch (e) {
    detalle.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function pastilla(clase, n, etiqueta, nivel) {
  return `
    <button type="button" class="pastilla ${clase}" data-nivel="${nivel}" aria-expanded="false">
      <span class="pastilla-punto"></span>
      <div><span class="pastilla-n">${n}</span><span class="pastilla-t">${etiqueta}</span></div>
    </button>
  `;
}

// --- Centro de alertas: agrupa cosas que ya existían pero no se veían
// juntas en ningún lado (semáforo en rojo, fichas incompletas, seguimiento
// que requiere atención) — nada de esto es un cálculo nuevo, es la misma
// información operativa reunida para saber qué revisar primero. Nunca una
// conclusión espiritual — pedido del usuario, 2026-08-12. ---
Router.on("/alertas", async () => {
  if (!requiereSesion()) return;
  if (!tieneAccesoPastoral()) {
    $app.innerHTML = `<p class="error">Esta sección es solo para líderes y encargados.</p>`;
    return;
  }
  const miToken = Router.token();
  $app.innerHTML = `
    ${botonAtras("/panel", "Panel")}
    <h1>Alertas</h1>
    <p class="hint">Todo lo de acá es información operativa para decidir qué revisar primero — nunca una conclusión sobre nadie.</p>
    <div id="alertas-cuerpo"><p class="hint">Cargando...</p></div>
  `;
  try {
    const [rojos, incompletas, atencion] = await Promise.all([
      Api.alertasDetalle("rojo"),
      Api.fichasIncompletas(),
      Api.seguimientosRequierenAtencion(),
    ]);
    if (!Router.vigente(miToken)) return;
    document.getElementById("alertas-cuerpo").innerHTML = `
      <h2>Semáforo en rojo · 30 días (${rojos.length})</h2>
      ${
        rojos.length
          ? `<ul class="kpi-lista">${rojos.map((p) => `<li><a href="#/personas/ver?id=${p.id}">${p.nombre_completo}</a></li>`).join("")}</ul>`
          : `<p class="hint">Nadie en rojo ahora mismo.</p>`
      }

      <h2>Fichas incompletas (${incompletas.length})</h2>
      ${
        incompletas.length
          ? `<ul class="kpi-lista">${incompletas
              .map(
                (p) =>
                  `<li><a href="#/personas/ver?id=${p.id}">${p.nombre_completo}</a><span class="badge ${nivelFicha(p.ficha_completa_pct)}">${p.ficha_completa_pct}%</span></li>`
              )
              .join("")}</ul>`
          : `<p class="hint">Todas las fichas activas están por encima del umbral.</p>`
      }

      <h2>Seguimientos que requieren atención (${atencion.length})</h2>
      ${
        atencion.length
          ? `<ul class="kpi-lista">${atencion
              .map((s) => `<li><a href="#/personas/ver?id=${s.persona_id}">${s.persona_nombre}</a><span class="hint">${s.fecha}</span></li>`)
              .join("")}</ul>`
          : `<p class="hint">Nada pendiente.</p>`
      }
    `;
  } catch (e) {
    if (!Router.vigente(miToken)) return;
    document.getElementById("alertas-cuerpo").innerHTML = `<div class="error">${e.message}</div>`;
  }
});

// Tarjetas KPI del panel: se tocan y se abren mostrando la lista de
// personas detrás del número — antes solo se veía el total.
const KPI_PREVIA_LIMITE = 6;

function listaKpiHtml(personas, etiqueta, sinResultadosTexto) {
  if (!personas.length) return `<p class="kpi-vacio">${sinResultadosTexto}</p>`;
  return `<ul class="kpi-lista">${personas
    .map((p) => `<li>${p.nombre_completo}<span class="badge ALTA">${etiqueta(p)}</span></li>`)
    .join("")}</ul>`;
}

function pintarKpis(items) {
  const grid = document.getElementById("grid-kpi");
  grid.innerHTML = "";
  items.forEach((item, idx) => {
    const esLarga = item.personas.length > KPI_PREVIA_LIMITE;
    const art = document.createElement("article");
    art.className = "kpi";
    art.dataset.abierto = "false";
    const idDet = `kpi-detalle-${idx}`;
    const hrefVerTodos = item.filtro ? `#/personas?filtro=${item.filtro}` : "#/personas";
    const vacioTexto = item.vacioTexto || "Nadie en esta categoría todavía.";
    const buscadorHtml = esLarga
      ? `<input type="search" class="kpi-buscador" placeholder="Buscar en esta lista..." autocomplete="off">`
      : "";
    const listaHtml = listaKpiHtml(item.personas.slice(0, KPI_PREVIA_LIMITE), item.etiqueta, vacioTexto);
    const linkVerTodosHtml = esLarga
      ? `<a class="kpi-vertodos" href="${hrefVerTodos}">Ver los ${item.personas.length} completos →</a>`
      : "";
    art.innerHTML = `
      <button class="kpi-cabecera" type="button" aria-expanded="false" aria-controls="${idDet}">
        <span class="kpi-num">${item.valor}</span>
        <span class="kpi-meta">
          <span class="kpi-label">${item.label}</span>
          <span class="kpi-flecha"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
        </span>
      </button>
      <div class="kpi-detalle" id="${idDet}">
        <div class="kpi-detalle-int">
          ${buscadorHtml}
          <div class="kpi-lista-slot">${listaHtml}</div>
          <div class="kpi-vertodos-slot">${linkVerTodosHtml}</div>
        </div>
      </div>
    `;
    art.querySelector("button.kpi-cabecera").addEventListener("click", () => {
      const abierto = art.dataset.abierto === "true";
      art.dataset.abierto = abierto ? "false" : "true";
      art.querySelector("button.kpi-cabecera").setAttribute("aria-expanded", String(!abierto));
    });
    if (esLarga) {
      const $buscador = art.querySelector(".kpi-buscador");
      const $listaSlot = art.querySelector(".kpi-lista-slot");
      const $verTodosSlot = art.querySelector(".kpi-vertodos-slot");
      $buscador.addEventListener("input", (e) => {
        const q = normalizarTexto(e.target.value.trim());
        if (!q) {
          $listaSlot.innerHTML = listaKpiHtml(item.personas.slice(0, KPI_PREVIA_LIMITE), item.etiqueta, vacioTexto);
          $verTodosSlot.innerHTML = linkVerTodosHtml;
          return;
        }
        const encontradas = item.personas.filter((p) => normalizarTexto(p.nombre_completo).includes(q));
        $listaSlot.innerHTML = listaKpiHtml(encontradas, item.etiqueta, `Nadie coincide con "${e.target.value.trim()}".`);
        $verTodosSlot.innerHTML = "";
      });
    }
    grid.appendChild(art);
  });
}

function stat(num, label) {
  return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
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

// --- Administración (solo admin) ---
$btnAdminGear.addEventListener("click", () => Router.navegar("/admin"));

Router.on("/admin", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/panel", "Panel")}
    <h1>Administración</h1>
    <p class="admin-sub">Acciones que solo ve el administrador — no aparecen para líderes ni consolidación.</p>
    <div class="lista-admin">
      <a class="fila-admin" href="#/usuarios">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.3"/></svg></span>
        <span class="fila-admin-texto"><strong>Gestionar usuarios</strong><small>Crear o desactivar líderes y encargados</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
      <a class="fila-admin" href="#/admin/excel">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5a1 1 0 0 0 1 1h5"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M9.5 12.5l2 4M11.5 12.5l-2 4"/></svg></span>
        <span class="fila-admin-texto"><strong>Excel</strong><small>Descargar, subir plantilla, cargar datos iniciales o actualizar</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
    </div>
  `;
});

// --- Excel: reúne las 4 acciones relacionadas (antes eran 4 filas sueltas
// en Administración, quedaba abarrotado — pedido del usuario, 2026-08-12) ---
Router.on("/admin/excel", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/admin", "Administración")}
    <h1>Excel</h1>
    <div class="lista-admin">
      <a class="fila-admin" href="#" id="btn-exportar-excel">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10M8 10l4 4 4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
        <span class="fila-admin-texto"><strong>Descargar Excel</strong><small id="descargar-excel-sub">Exporta con el diseño del libro real</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
      <a class="fila-admin" href="#/admin/actualizar-excel">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.2M20 12a8 8 0 0 1-14 5.2"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></span>
        <span class="fila-admin-texto"><strong>Actualizar desde Excel</strong><small>Descargá, corregí en Excel y volvé a subirlo — actualiza solo lo que cambió</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
      <a class="fila-admin" href="#/admin/migracion">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
        <span class="fila-admin-texto"><strong>Cargar datos iniciales</strong><small>Solo la primera vez — sube el Excel real para poblar la app. Se niega si ya hay personas</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
      <a class="fila-admin" href="#/admin/plantilla">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
        <span class="fila-admin-texto"><strong>Subir plantilla</strong><small>El libro real que se usa para "Descargar Excel" — se sube una sola vez</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
    </div>
    <div class="error" id="admin-error"></div>
  `;

  document.getElementById("btn-exportar-excel").addEventListener("click", async (e) => {
    e.preventDefault();
    const fila = e.currentTarget;
    const textoOriginal = fila.querySelector("strong").textContent;
    fila.querySelector("strong").textContent = "Generando...";
    try {
      const blob = await Api.descargarExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "MARCADOS_export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      document.getElementById("admin-error").textContent = err.message || "No se pudo generar el Excel.";
    } finally {
      fila.querySelector("strong").textContent = textoOriginal;
    }
  });

  Api.estadoPlantilla()
    .then((estado) => {
      const sub = document.getElementById("descargar-excel-sub");
      if (!sub) return;
      sub.textContent = estado.configurada
        ? "Exporta con el diseño del libro real"
        : "Hace falta subir la plantilla primero (Subir plantilla)";
    })
    .catch(() => {});
});

// --- Subir la plantilla de Excel para "Descargar Excel" (solo admin) ---
Router.on("/admin/plantilla", async () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  const miToken = Router.token();
  $app.innerHTML = `
    ${botonAtras("/admin/excel", "Excel")}
    <h1>Plantilla de Excel</h1>
    <p class="hint">El libro real (con su diseño, fórmulas y catálogos) que usa "Descargar Excel" para exportar. Se guarda en la base de datos — sobrevive a cualquier actualización de la app, no hace falta subirlo de nuevo salvo que quieras cambiarlo.</p>
    <div id="plantilla-estado" class="hint">Consultando...</div>
    <label>Archivo (.xlsx)</label>
    <input type="file" id="plantilla-archivo" accept=".xlsx,.xlsm">
    <button class="primary" id="btn-subir-plantilla" type="button">Subir plantilla</button>
    <div class="error" id="plantilla-error"></div>
  `;

  async function pintarEstado() {
    try {
      const estado = await Api.estadoPlantilla();
      if (!Router.vigente(miToken)) return;
      document.getElementById("plantilla-estado").innerHTML = estado.configurada
        ? `<div class="card">Plantilla actual: <strong>${estado.nombre_archivo || "—"}</strong>${estado.actualizado_en ? ` <span class="hint">(subida el ${new Date(estado.actualizado_en).toLocaleDateString("es-CO")})</span>` : ""}</div>`
        : `<p class="hint">Todavía no hay ninguna plantilla subida — "Descargar Excel" no va a funcionar hasta que subas una.</p>`;
    } catch (e) {
      if (!Router.vigente(miToken)) return;
      document.getElementById("plantilla-estado").innerHTML = `<div class="error">${e.message}</div>`;
    }
  }
  await pintarEstado();

  document.getElementById("btn-subir-plantilla").addEventListener("click", async () => {
    const input = document.getElementById("plantilla-archivo");
    const archivo = input.files && input.files[0];
    const errorBox = document.getElementById("plantilla-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    try {
      await Api.subirPlantilla(archivo);
      input.value = "";
      await pintarEstado();
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo subir la plantilla.";
    }
  });
});

// --- Carga inicial: subir el Excel real (solo admin) ---
Router.on("/admin/migracion", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/admin/excel", "Excel")}
    <h1>Cargar datos iniciales del Excel</h1>
    <p class="hint">Solo para la primera vez: sube el archivo Excel real con los jóvenes para poblar la app. Primero se muestra una vista previa (no guarda nada) — recién con "Confirmar" se escribe en la base. Se niega a correr si ya hay personas cargadas.</p>
    <label>Archivo (.xlsx)</label>
    <input type="file" id="migracion-archivo" accept=".xlsx,.xlsm">
    <button class="primary" id="btn-vista-previa" type="button">Ver vista previa</button>
    <div id="migracion-reporte"></div>
    <button class="primary" id="btn-confirmar" type="button" hidden>Confirmar migración real</button>
    <div class="error" id="migracion-error"></div>
  `;

  function archivoElegido() {
    const input = document.getElementById("migracion-archivo");
    return input.files && input.files[0];
  }

  function pintarReporte(reporte) {
    const cont = document.getElementById("migracion-reporte");
    const btnConfirmar = document.getElementById("btn-confirmar");
    if (reporte.error) {
      cont.innerHTML = `<div class="error">${reporte.error}</div>`;
      btnConfirmar.hidden = true;
      return;
    }
    const catalogos = Object.entries(reporte.catalogos || {})
      .map(([tipo, n]) => `${tipo}: ${n}`)
      .join(", ");
    const sinApellido = (reporte.sin_apellido || []).map((f) => `${f.id_unico} ${f.nombres}`).join(", ") || "ninguno";
    const sinEstado = (reporte.sin_estado || []).map((f) => `${f.id_unico} ${f.nombre_completo}`).join(", ") || "ninguno";
    const compartidos = Object.entries(reporte.telefonos_compartidos || {})
      .map(([tel, nombres]) => `${tel}: ${nombres.join(", ")}`)
      .join("<br>") || "ninguno";
    cont.innerHTML = `
      <div class="card">
        <div><strong>Personas leídas:</strong> ${reporte.total_leidas}</div>
        <div><strong>Catálogos:</strong> ${catalogos}</div>
        <div class="hint"><strong>Sin apellido (no bloquea):</strong> ${sinApellido}</div>
        <div class="hint"><strong>Sin Estado (queda marcado para revisión):</strong> ${sinEstado}</div>
        <div class="hint"><strong>Teléfonos compartidos (quedan marcados para revisión):</strong><br>${compartidos}</div>
        ${reporte.resultado ? `<div><strong>${reporte.mensaje}</strong> Personas creadas: ${reporte.resultado.personas_creadas}, catálogos: ${reporte.resultado.catalogos_creados}, seguimientos de revisión: ${reporte.resultado.seguimientos_creados}.</div>` : `<div class="hint">${reporte.mensaje || ""}</div>`}
      </div>
    `;
    btnConfirmar.hidden = !!reporte.resultado; // ya se confirmó, no mostrar el botón de nuevo
  }

  document.getElementById("btn-vista-previa").addEventListener("click", async () => {
    const archivo = archivoElegido();
    const errorBox = document.getElementById("migracion-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    try {
      const reporte = await Api.migrarExcel(archivo, false);
      pintarReporte(reporte);
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo leer el archivo.";
    }
  });

  document.getElementById("btn-confirmar").addEventListener("click", async () => {
    const archivo = archivoElegido();
    const errorBox = document.getElementById("migracion-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    if (!confirm("¿Seguro? Esto escribe los jóvenes reales en la base de datos en vivo. No se puede deshacer desde acá.")) return;
    try {
      const reporte = await Api.migrarExcel(archivo, true);
      pintarReporte(reporte);
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo migrar.";
    }
  });
});

// --- Actualizar desde Excel: descargar, corregir, volver a subir (pedido
// del usuario, 2026-08-12) — actualiza solo a quien coincide por ID único,
// nunca crea ni borra personas por esta vía. ---
Router.on("/admin/actualizar-excel", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/admin/excel", "Excel")}
    <h1>Actualizar desde Excel</h1>
    <p class="hint">
      Descargá el Excel desde "Descargar Excel", corregí lo que haga falta ahí y subilo acá. Se actualiza solo a
      quien coincida por ID único (columna A) con lo que cambió — nunca crea personas nuevas ni borra a nadie por
      esta vía. Primero se muestra una vista previa (no guarda nada); recién con "Confirmar" se escribe.
    </p>
    <label>Archivo (.xlsx)</label>
    <input type="file" id="actualizar-archivo" accept=".xlsx,.xlsm">
    <button class="primary" id="btn-actualizar-vista-previa" type="button">Ver vista previa</button>
    <div id="actualizar-reporte"></div>
    <button class="primary" id="btn-actualizar-confirmar" type="button" hidden>Confirmar actualización</button>
    <div class="error" id="actualizar-error"></div>
  `;

  function archivoElegido() {
    const input = document.getElementById("actualizar-archivo");
    return input.files && input.files[0];
  }

  const NOMBRES_CAMPO = {
    nombres: "Nombres",
    apellidos: "Apellidos",
    genero: "Género",
    fecha_nacimiento: "Fecha de nacimiento",
    edad_manual: "Edad",
    estado: "Estado",
    servidor: "Servidor",
    bautizado: "Bautizado",
    estudio_biblico: "Estudio bíblico",
    telefono: "Teléfono",
    correo_electronico: "Correo electrónico",
    direccion: "Dirección",
    notas: "Notas",
  };

  function etiquetaCampo(campo) {
    return NOMBRES_CAMPO[campo] || campo;
  }

  function etiquetaValor(valor) {
    if (valor === true) return "Sí";
    if (valor === false) return "No";
    return valor ?? "—";
  }

  function pintarReporte(reporte) {
    const cont = document.getElementById("actualizar-reporte");
    const btnConfirmar = document.getElementById("btn-actualizar-confirmar");
    const conCambios = reporte.personas_con_cambios || [];
    const sinCoincidencia = reporte.filas_sin_coincidencia || [];
    const sinMencionar = reporte.personas_sin_mencionar || [];

    const listaCambios = conCambios.length
      ? conCambios
          .map(
            (p) => `
        <div class="card">
          <strong>${p.nombre_completo}</strong> <span class="hint">${p.id_unico}</span>
          <ul class="kpi-lista">
            ${Object.entries(p.campos_cambiados)
              .map(([campo, v]) => `<li>${etiquetaCampo(campo)}: <span class="hint">${etiquetaValor(v.antes)}</span> → <strong>${etiquetaValor(v.despues)}</strong></li>`)
              .join("")}
          </ul>
        </div>
      `
          )
          .join("")
      : `<p class="hint">Nadie tiene cambios.</p>`;

    cont.innerHTML = `
      <h2>Cambios detectados (${conCambios.length})</h2>
      ${listaCambios}
      ${
        sinCoincidencia.length
          ? `<h2>Filas sin ID reconocido (${sinCoincidencia.length})</h2>
             <p class="hint">No se tocan — revisá si el ID único de esas filas está bien escrito.</p>
             <ul class="kpi-lista">${sinCoincidencia.map((f) => `<li>Fila ${f.fila_excel}: "${f.id_unico || "vacío"}" — ${f.nombres || "sin nombre"}</li>`).join("")}</ul>`
          : ""
      }
      ${
        sinMencionar.length
          ? `<p class="hint">${sinMencionar.length} persona${sinMencionar.length === 1 ? "" : "s"} de la base no aparece${sinMencionar.length === 1 ? "" : "n"} en este Excel — no se les toca nada.</p>`
          : ""
      }
      ${reporte.resultado ? `<div class="card"><strong>${reporte.mensaje}</strong></div>` : `<p class="hint">${reporte.mensaje || ""}</p>`}
    `;
    btnConfirmar.hidden = !conCambios.length || !!reporte.resultado;
  }

  document.getElementById("btn-actualizar-vista-previa").addEventListener("click", async () => {
    const archivo = archivoElegido();
    const errorBox = document.getElementById("actualizar-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    try {
      const reporte = await Api.actualizarDesdeExcel(archivo, false);
      pintarReporte(reporte);
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo leer el archivo.";
    }
  });

  document.getElementById("btn-actualizar-confirmar").addEventListener("click", async () => {
    const archivo = archivoElegido();
    const errorBox = document.getElementById("actualizar-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    if (!confirm("¿Seguro? Esto va a escribir estos cambios en la base de datos en vivo.")) return;
    try {
      const reporte = await Api.actualizarDesdeExcel(archivo, true);
      pintarReporte(reporte);
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo actualizar.";
    }
  });
});

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

// --- Ver jóvenes registrados ---
function etiquetaFiltroPersonas(filtro) {
  return {
    activos: "Activos",
    inactivos: "Inactivos",
    bautizados: "Bautizados",
    servidores: "Sirviendo",
    asistio30: "Asistieron en los últimos 30 días",
  }[filtro] || null;
}

function normalizarTexto(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function filaPersona(p) {
  return `
    <a class="card-link" href="#/personas/ver?id=${p.id}">
    <div class="card">
      <strong>${p.nombres} ${p.apellidos}</strong>${badgeFicha(p)}
      <div class="hint">
        ${p.id_unico}${p.estado ? " · " + p.estado : ""}${p.activo_ministerio ? " · activo" : ""}${p.bautizado ? " · bautizado" : ""}
        ${p.servidor ? " · servidor" + (p.fecha_inicio_servicio ? ` desde ${p.fecha_inicio_servicio}` : "") : ""}
      </div>
      <div class="hint">Ingresó: ${p.fecha_ingreso || "—"}</div>
    </div>
    </a>
  `;
}

Router.on("/personas", async () => {
  if (!requiereSesion()) return;
  const miToken = Router.token();
  const filtro = Router.query().get("filtro");
  const etiqueta = etiquetaFiltroPersonas(filtro);
  $app.innerHTML = `
    <h1>Jóvenes registrados</h1>
    ${etiqueta ? `<p class="hint">Mostrando: <strong>${etiqueta}</strong> — <a href="#/personas">quitar filtro</a></p>` : ""}
    <input type="search" id="buscador-jovenes" placeholder="Buscar por nombre..." autocomplete="off">
    <div class="accesos-rapidos">
      <a class="acceso-rapido" href="#/personas/incompletas">
        <span class="acceso-rapido-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6M9 16h6M9 8h2"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg></span>
        Fichas incompletas
      </a>
      <a class="acceso-rapido" href="#/invitaciones">
        <span class="acceso-rapido-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M8.5 14 6 21l6-3 6 3-2.5-7"/></svg></span>
        Ranking de invitaciones
      </a>
    </div>
    <div id="lista-personas" class="hint">Cargando...</div>
  `;
  try {
    const [activas, inactivas] = await Promise.all([Api.personas(true), Api.personas(false)]);
    if (!Router.vigente(miToken)) return;
    let personas = activas.concat(inactivas);
    if (filtro === "activos") personas = personas.filter((p) => p.activo_ministerio);
    else if (filtro === "inactivos") personas = inactivas;
    else if (filtro === "bautizados") personas = personas.filter((p) => p.bautizado);
    else if (filtro === "servidores") personas = personas.filter((p) => p.servidor);
    else if (filtro === "asistio30") {
      const asistieron = await Api.asistieron30Dias();
      if (!Router.vigente(miToken)) return;
      const ids = new Set(asistieron.map((p) => p.id));
      personas = personas.filter((p) => ids.has(p.id));
    }

    const cont = document.getElementById("lista-personas");
    function pintar(lista) {
      if (!lista.length) {
        cont.innerHTML = `<p class="hint">${etiqueta ? "Nadie en esta categoría todavía." : "Todavía no hay jóvenes registrados."}</p>`;
        return;
      }
      cont.innerHTML = lista.map(filaPersona).join("");
    }
    pintar(personas);

    document.getElementById("buscador-jovenes").addEventListener("input", (e) => {
      const q = normalizarTexto(e.target.value.trim());
      if (!q) {
        pintar(personas);
        return;
      }
      const filtradas = personas.filter((p) => normalizarTexto(`${p.nombres} ${p.apellidos}`).includes(q));
      if (!filtradas.length) {
        cont.innerHTML = `<p class="hint">Nadie coincide con "${e.target.value.trim()}".</p>`;
        return;
      }
      cont.innerHTML = filtradas.map(filaPersona).join("");
    });
  } catch (e) {
    if (!Router.vigente(miToken)) return;
    $app.innerHTML += `<div class="error">${e.message}</div>`;
  }
});

// --- Ficha individual: ver, editar, seguimiento ---
const CAMPOS_EDITABLES_FICHA = [
  ["nombres", "Nombres", "text"],
  ["apellidos", "Apellidos", "text"],
  ["genero", "Género", "catalogo:genero"],
  ["fecha_nacimiento", "Fecha de nacimiento", "date"],
  ["estado", "Estado", "catalogo:estado"],
  ["telefono", "Teléfono", "text"],
  ["correo_electronico", "Correo electrónico", "text"],
  ["direccion", "Dirección", "text"],
  ["contacto_emergencia", "Contacto de emergencia", "text"],
  ["parentesco", "Parentesco", "catalogo:parentesco"],
  ["telefono_emergencia", "Teléfono de emergencia", "text"],
  ["grupo_sanguineo", "Grupo sanguíneo", "catalogo:grupo_sanguineo"],
  ["eps", "EPS", "catalogo:eps"],
  ["talla", "Talla", "catalogo:talla"],
  ["estudio_biblico", "Estudio bíblico", "catalogo:formacion"],
  ["como_llego", "Cómo llegó", "text"],
  ["notas", "Notas", "text"],
];

// Trae una sola vez cada catálogo que usan los desplegables de la ficha
// (sección 15 del handoff: los catálogos reales del Excel alimentan los
// desplegables, no listas escritas a mano).
// Los catálogos (género, estado, EPS...) son datos de referencia casi
// estáticos — pedirlos de nuevo cada vez que se abre una ficha suma viajes
// de red innecesarios cuando alguien revisa varias fichas seguidas. Se
// cachean en memoria una vez por sesión (pedido del usuario, 2026-08-12).
let _catalogosFichaCache = null;

async function cargarCatalogosFicha() {
  if (_catalogosFichaCache) return _catalogosFichaCache;
  const tipos = [...new Set(
    CAMPOS_EDITABLES_FICHA.filter(([, , tipo]) => tipo.startsWith("catalogo:")).map(([, , tipo]) => tipo.split(":")[1])
  )];
  const resultados = await Promise.all(tipos.map((t) => Api.catalogo(t).catch(() => [])));
  const mapa = {};
  tipos.forEach((t, i) => (mapa[t] = resultados[i]));
  _catalogosFichaCache = mapa;
  return mapa;
}

function nivelAsistenciaEtiqueta(nivel) {
  return { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo", sin_datos: "Sin datos" }[nivel] || nivel;
}

Router.on("/personas/ver", async () => {
  if (!requiereSesion()) return;
  const id = Router.query().get("id");
  if (!id) {
    Router.navegar("/personas");
    return;
  }
  const miToken = Router.token();
  $app.innerHTML = `<p class="hint">Cargando ficha...</p>`;
  try {
    const accesoPastoral = tieneAccesoPastoral();
    const [persona, alertas, seguimientos, catalogos, areasDisponibles] = await Promise.all([
      Api.persona(id),
      accesoPastoral ? Api.alertasPersona(id) : Promise.resolve(null),
      accesoPastoral ? Api.historialSeguimiento(id) : Promise.resolve(null),
      cargarCatalogosFicha(),
      Api.areasServicio().catch(() => []),
    ]);
    if (!Router.vigente(miToken)) return;
    renderFicha(persona, alertas, seguimientos, catalogos, areasDisponibles);
  } catch (e) {
    if (!Router.vigente(miToken)) return;
    $app.innerHTML = `<div class="error">${e.message}</div>`;
  }
});

// Tipos fijos de contacto pastoral — no es un catálogo administrable desde
// Excel, es una lista corta y estable (pedido del usuario, 2026-08-12).
const TIPOS_SEGUIMIENTO = ["Llamada", "Visita", "Mensaje", "Reunión personal", "Oración", "Otro"];

// --- "Activo en el ministerio": confirmación manual persona por persona
// (pedido del usuario, 2026-08-13) — nunca se marca sola al crear/editar
// otros campos, arranca en False para todos y el liderazgo la va tocando
// a mano a medida que confirma quién sigue participando. ---
function pintarActivoMinisterio(persona) {
  const slot = document.getElementById("activo-ministerio-slot");
  if (!slot) return;
  const texto = persona.activo_ministerio
    ? `<strong>Activo</strong><small>Confirmado como activo en el ministerio</small>`
    : `<strong>Sin confirmar</strong><small>Todavía no se marcó como activo</small>`;
  const boton = persona.activo_ministerio
    ? `<button type="button" class="btn-servidor quitar" id="btn-toggle-activo-ministerio">Quitar de activos</button>`
    : `<button type="button" class="btn-servidor marcar" id="btn-toggle-activo-ministerio">Marcar como activo</button>`;
  slot.innerHTML = `<div class="servicio-card"><div class="servicio-card-texto">${texto}</div>${boton}</div>`;

  document.getElementById("btn-toggle-activo-ministerio").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const actualizada = await Api.editarPersona(persona.id, { activo_ministerio: !persona.activo_ministerio });
      Object.assign(persona, actualizada);
      pintarActivoMinisterio(persona);
    } catch (err) {
      btn.disabled = false;
      alert(`No se pudo actualizar: ${err.message}`);
    }
  });
}

// --- Estado de servicio: botón directo en la ficha (reemplaza la pantalla
// aparte "Nuevo servidor (reunión STAFF)", pedido del usuario, 2026-08-12).
// Distingue servidor ACTIVO de servidor INACTIVO (fue servidor, ya no) a
// partir de servidor + fecha_inicio_servicio — no hace falta un campo nuevo. ---
function pintarServicio(persona) {
  const slot = document.getElementById("servicio-slot");
  if (!slot) return;
  const fueServidor = !!persona.fecha_inicio_servicio;
  let texto, boton;
  if (persona.servidor) {
    texto = `<strong>Servidor activo</strong><small>${fueServidor ? `Desde ${persona.fecha_inicio_servicio}` : ""}</small>`;
    boton = `<button type="button" class="btn-servidor quitar" id="btn-toggle-servidor">Quitar de servidor</button>`;
  } else if (fueServidor) {
    texto = `<strong>Servidor inactivo</strong><small>Fue servidor desde ${persona.fecha_inicio_servicio}, ya no está sirviendo</small>`;
    boton = `<button type="button" class="btn-servidor marcar" id="btn-toggle-servidor">Reactivar como servidor</button>`;
  } else {
    texto = `<strong>No es servidor</strong><small>Solo asiste</small>`;
    boton = `<button type="button" class="btn-servidor marcar" id="btn-toggle-servidor">Marcar como servidor</button>`;
  }
  slot.innerHTML = `<div class="servicio-card"><div class="servicio-card-texto">${texto}</div>${boton}</div>`;

  document.getElementById("btn-toggle-servidor").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const actualizada = persona.servidor
        ? await Api.editarPersona(persona.id, { servidor: false })
        : await Api.marcarServidor(persona.id);
      Object.assign(persona, actualizada);
      pintarServicio(persona);
    } catch (err) {
      btn.disabled = false;
      alert(`No se pudo actualizar: ${err.message}`);
    }
  });
}

function renderFicha(persona, alertas, seguimientos, catalogos, areasDisponibles) {
  const seccionAlertas = alertas
    ? `
    <div class="stat-grid">
      ${stat(persona.ficha_completa_pct + "%", "Ficha completa")}
      ${stat(nivelAsistenciaEtiqueta(alertas.nivel_asistencia), "Asistencia (30d)")}
      ${stat(alertas.inasistencias_consecutivas, "Inasistencias seguidas")}
    </div>`
    : `<div class="stat-grid">${stat(persona.ficha_completa_pct + "%", "Ficha completa")}</div>`;

  const pendientesAtencion = (seguimientos || []).filter((s) => s.requiere_atencion).length;
  const seccionSeguimiento = seguimientos
    ? `
    <h2>Seguimiento pastoral</h2>
    <p class="aviso-atencion" id="aviso-atencion" ${pendientesAtencion ? "" : "hidden"}>
      ⚠ ${pendientesAtencion} registro${pendientesAtencion === 1 ? "" : "s"} marcado${pendientesAtencion === 1 ? "" : "s"} como "requiere atención"
    </p>
    <div id="lista-seguimiento"></div>
    <form id="form-seguimiento">
      <label>Tipo</label>
      <select id="seg-tipo">
        <option value="">-- Seleccionar --</option>
        ${TIPOS_SEGUIMIENTO.map((t) => `<option value="${t}">${t}</option>`).join("")}
      </select>
      <div id="seg-tipo-otro-slot"></div>
      <label>Fecha</label>
      <input type="date" id="seg-fecha" value="${new Date().toISOString().slice(0, 10)}">
      <label>Observaciones</label>
      <textarea id="seg-notas" required placeholder="Qué se conversó, cómo está, próximos pasos..."></textarea>
      <label class="check-label"><input type="checkbox" id="seg-requiere-atencion"> Requiere atención</label>
      <p class="hint">Quien lo revise después lo ve resaltado en el historial de esta persona — no manda ninguna alerta ni notificación por sí solo.</p>
      <button class="primary" type="submit">Agregar registro</button>
      <div class="error" id="seguimiento-error"></div>
    </form>`
    : "";

  $app.innerHTML = `
    ${botonAtras("/personas", "Jóvenes")}
    <h1>${persona.nombres} ${persona.apellidos}</h1>
    <p class="hint">${persona.id_unico}</p>
    ${seccionAlertas}
    ${persona.datos_faltantes.length ? `<p class="hint">Faltan: ${persona.datos_faltantes.join(", ")}</p>` : ""}

    <div id="activo-ministerio-slot"></div>
    <div id="servicio-slot"></div>

    <h2>Datos</h2>
    <form id="form-ficha"></form>
    <button id="btn-editar-ficha" class="secundario">Editar</button>
    <div class="error" id="ficha-error"></div>

    ${seccionSeguimiento}
  `;

  pintarActivoMinisterio(persona);
  pintarServicio(persona);

  let editando = false;
  const $form = document.getElementById("form-ficha");
  const $btnEditar = document.getElementById("btn-editar-ficha");

  function campoInput(campo, etiqueta, tipo, valor) {
    if (tipo.startsWith("catalogo:")) {
      const opciones = (catalogos[tipo.split(":")[1]] || [])
        .map((c) => `<option value="${c.valor}" ${c.valor === valor ? "selected" : ""}>${c.valor}</option>`)
        .join("");
      return `<label>${etiqueta}</label><select data-campo="${campo}"><option value="">-- Seleccionar --</option>${opciones}</select>`;
    }
    return `<label>${etiqueta}</label><input type="${tipo}" data-campo="${campo}" value="${valor}">`;
  }

  function areasHtml() {
    const actuales = persona.areas_servicio || [];
    if (!editando) {
      return `<div class="hint"><strong>Áreas de servicio:</strong> ${actuales.length ? actuales.map((a) => a.nombre).join(", ") : "—"}</div>`;
    }
    if (!areasDisponibles.length) return "";
    const actualesIds = new Set(actuales.map((a) => a.id));
    return `
      <label>Áreas de servicio</label>
      <div class="check-grid">
        ${areasDisponibles
          .map(
            (a) =>
              `<label class="check-label"><input type="checkbox" data-area-id="${a.id}" ${actualesIds.has(a.id) ? "checked" : ""}> ${a.nombre}</label>`
          )
          .join("")}
      </div>
    `;
  }

  function pintarFicha() {
    const camposHtml = CAMPOS_EDITABLES_FICHA.map(([campo, etiqueta, tipo]) => {
      const valor = persona[campo] ?? "";
      if (!editando) {
        return `<div class="hint"><strong>${etiqueta}:</strong> ${valor || "—"}</div>`;
      }
      return campoInput(campo, etiqueta, tipo, valor);
    }).join("");

    $form.innerHTML =
      camposHtml +
      areasHtml() +
      (editando ? `<button class="primary" type="submit" id="btn-guardar-ficha" hidden>Guardar</button>` : "");
    $btnEditar.hidden = editando;

    if (editando) {
      const marcarCambio = () => {
        document.getElementById("btn-guardar-ficha").hidden = false;
      };
      $form.querySelectorAll("[data-campo], [data-area-id]").forEach((el) => {
        el.addEventListener("input", marcarCambio);
        el.addEventListener("change", marcarCambio);
      });
    }
  }
  pintarFicha();

  $btnEditar.addEventListener("click", () => {
    editando = true;
    pintarFicha();
  });

  $form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("ficha-error");
    errorBox.textContent = "";
    const cambios = {};
    $form.querySelectorAll("[data-campo]").forEach((input) => {
      cambios[input.dataset.campo] = input.value || null;
    });
    const areaIdsSeleccionados = [...$form.querySelectorAll("[data-area-id]:checked")].map((el) => Number(el.dataset.areaId));
    const areaIdsActuales = (persona.areas_servicio || []).map((a) => a.id);
    const areasCambiaron =
      areaIdsSeleccionados.length !== areaIdsActuales.length ||
      !areaIdsSeleccionados.every((id) => areaIdsActuales.includes(id));

    try {
      if (Object.keys(cambios).length) {
        const actualizada = await Api.editarPersona(persona.id, cambios);
        Object.assign(persona, actualizada);
      }
      if (areasCambiaron) {
        persona.areas_servicio = await Api.actualizarAreasPersona(persona.id, areaIdsSeleccionados);
      }
      editando = false;
      pintarFicha();
    } catch (err) {
      errorBox.textContent = err.message || "No se pudo guardar.";
    }
  });

  if (seguimientos) {
    const $listaSeg = document.getElementById("lista-seguimiento");
    document.getElementById("seg-tipo").addEventListener("change", (e) => {
      const slot = document.getElementById("seg-tipo-otro-slot");
      slot.innerHTML = e.target.value === "Otro" ? `<input type="text" id="seg-tipo-otro" placeholder="¿Cuál?">` : "";
    });

    function pintarSeguimientos(lista) {
      if (!lista.length) {
        $listaSeg.innerHTML = `<p class="hint">Todavía no hay registros de seguimiento.</p>`;
        return;
      }
      $listaSeg.innerHTML = lista
        .map(
          (s) => `
        <div class="card">
          <strong>${s.fecha}</strong>${s.tipo ? " · " + s.tipo : ""}${s.requiere_atencion ? ` <span class="badge BAJA">requiere atención</span>` : ""}
          <div class="hint">${s.notas}</div>
        </div>
      `
        )
        .join("");
      const avisoEl = document.getElementById("aviso-atencion");
      const pendientes = lista.filter((s) => s.requiere_atencion).length;
      avisoEl.hidden = !pendientes;
      avisoEl.textContent = `⚠ ${pendientes} registro${pendientes === 1 ? "" : "s"} marcado${pendientes === 1 ? "" : "s"} como "requiere atención"`;
    }
    pintarSeguimientos(seguimientos);

    document.getElementById("form-seguimiento").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById("seguimiento-error");
      errorBox.textContent = "";
      const tipoSeleccionado = document.getElementById("seg-tipo").value;
      const tipoOtro = document.getElementById("seg-tipo-otro");
      const tipo = tipoSeleccionado === "Otro" && tipoOtro && tipoOtro.value.trim() ? tipoOtro.value.trim() : tipoSeleccionado || null;
      try {
        await Api.crearSeguimiento({
          persona_id: persona.id,
          tipo,
          fecha: document.getElementById("seg-fecha").value || null,
          notas: document.getElementById("seg-notas").value,
          requiere_atencion: document.getElementById("seg-requiere-atencion").checked,
        });
        const nuevos = await Api.historialSeguimiento(persona.id);
        pintarSeguimientos(nuevos);
        e.target.reset();
        document.getElementById("seg-fecha").value = new Date().toISOString().slice(0, 10);
        document.getElementById("seg-tipo-otro-slot").innerHTML = "";
      } catch (err) {
        errorBox.textContent = err.message || "No se pudo guardar el seguimiento.";
      }
    });
  }
}

// --- Ranking de invitaciones (pedido del usuario, 2026-08-10) ---
Router.on("/invitaciones", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    ${botonAtras("/personas", "Jóvenes")}
    <h1>Ranking de invitaciones</h1>
    <p class="hint">Quién invitó más jóvenes que se registraron en el período. Información para el equipo — qué hacer con esto (un reconocimiento, nada) lo deciden ustedes.</p>
    <div>
      <button type="button" class="secundario periodo-btn" data-periodo="mes">Este mes</button>
      <button type="button" class="secundario periodo-btn" data-periodo="trimestre">Este trimestre</button>
      <button type="button" class="secundario periodo-btn" data-periodo="semestre">Este semestre</button>
    </div>
    <div id="lista-invitaciones" class="hint">Cargando...</div>
  `;

  async function cargar(periodo) {
    const cont = document.getElementById("lista-invitaciones");
    cont.innerHTML = "Cargando...";
    try {
      const ranking = await Api.invitacionesResumen(periodo);
      if (!ranking.length) {
        cont.innerHTML = `<p class="hint">Nadie registrado con "quién lo invitó" en este período todavía.</p>`;
        return;
      }
      cont.innerHTML = ranking
        .map(
          (r, i) => `
        <div class="card">
          <strong>${i + 1}. ${r.nombre_completo}</strong>
          <div class="hint">${r.id_unico} — invitó a ${r.cantidad} joven${r.cantidad === 1 ? "" : "es"}</div>
        </div>
      `
        )
        .join("");
    } catch (e) {
      cont.innerHTML = `<div class="error">${e.message}</div>`;
    }
  }

  document.querySelectorAll(".periodo-btn").forEach((btn) => {
    btn.addEventListener("click", () => cargar(btn.dataset.periodo));
  });
  cargar("mes");
});

// --- Fichas incompletas (sección 17 del handoff) ---
Router.on("/personas/incompletas", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    ${botonAtras("/personas", "Jóvenes")}
    <h1>Fichas incompletas</h1>
    <p class="hint">Ordenadas de menos a más completas. Esto es solo información operativa — nunca una conclusión sobre la persona.</p>
    <div id="lista-incompletas" class="hint">Cargando...</div>
  `;
  try {
    const personas = await Api.fichasIncompletas();
    const cont = document.getElementById("lista-incompletas");
    if (!personas.length) {
      cont.innerHTML = `<p class="hint">No hay fichas por debajo del umbral configurado.</p>`;
      return;
    }
    cont.innerHTML = personas
      .map(
        (p) => `
      <a class="card-link" href="#/personas/ver?id=${p.id}">
      <div class="card">
        <strong>${p.nombre_completo}</strong>${badgeFicha(p)}
        <div class="hint">${p.id_unico}</div>
        <div class="hint">Faltan: ${p.datos_faltantes.join(", ")}</div>
      </div>
      </a>
    `
      )
      .join("");
  } catch (e) {
    $app.innerHTML += `<div class="error">${e.message}</div>`;
  }
});

// --- Marcar nuevo servidor (reunión STAFF) ---
// --- Usuarios (solo admin) ---
Router.on("/usuarios", async () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/admin", "Administración")}
    <h1>Usuarios</h1>
    <form id="form-usuario">
      <label>Nombre</label>
      <input type="text" id="usr-nombre" required>
      <label>Email</label>
      <input type="email" id="usr-email" required autocapitalize="off" autocorrect="off">
      <label>Contraseña inicial</label>
      <input type="text" id="usr-password" required>
      <label>Rol</label>
      <select id="usr-rol">
        <option value="lider">Líder</option>
        <option value="encargado">Encargado</option>
        <option value="consolidacion">Consolidación</option>
        <option value="admin">Admin</option>
      </select>
      <button class="primary" type="submit">Crear usuario</button>
      <div class="error" id="usr-error"></div>
    </form>
    <h2>Existentes</h2>
    <div id="lista-usuarios" class="hint">Cargando...</div>
  `;

  async function cargarUsuarios() {
    const cont = document.getElementById("lista-usuarios");
    try {
      const usuarios = await Api.usuarios();
      cont.innerHTML = usuarios
        .map(
          (u) => `
        <div class="card">
          <strong>${u.nombre}</strong> ${u.activo ? "" : '<span class="badge BAJA">inactivo</span>'}
          <div class="hint">${u.email} · ${u.rol}</div>
          ${u.activo ? `<button class="tap-btn" type="button" data-id="${u.id}">Desactivar</button>` : ""}
        </div>
      `
        )
        .join("");
      cont.querySelectorAll("button[data-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await Api.desactivarUsuario(btn.dataset.id);
          cargarUsuarios();
        });
      });
    } catch (e) {
      cont.innerHTML = `<div class="error">${e.message}</div>`;
    }
  }

  document.getElementById("form-usuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("usr-error");
    errorBox.textContent = "";
    try {
      await Api.crearUsuario({
        nombre: document.getElementById("usr-nombre").value,
        email: document.getElementById("usr-email").value.trim(),
        password: document.getElementById("usr-password").value,
        rol: document.getElementById("usr-rol").value,
      });
      e.target.reset();
      cargarUsuarios();
    } catch (e2) {
      errorBox.textContent = e2.message;
    }
  });

  cargarUsuarios();
});

// --- Selector de actividad, con soporte para "Otro" (texto libre) ---
function opcionesActividades(actividades) {
  return actividades.map((a) => `<option value="${a.id}" data-nombre="${a.nombre}">${a.nombre}</option>`).join("");
}

function esOtroSeleccionado(selectId) {
  const opt = document.getElementById(selectId).selectedOptions[0];
  return opt && opt.dataset.nombre === "Otro";
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

// --- Registrar asistencia ---
Router.on("/asistencia", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `<p class="hint">Cargando actividades...</p>`;
  let actividades;
  try {
    actividades = await Api.actividades();
  } catch (e) {
    $app.innerHTML = `<div class="error">${e.message}</div>`;
    return;
  }
  if (!actividades.length) {
    $app.innerHTML = `<p class="error">No hay actividades configuradas. Pedile a un administrador que cree una.</p>`;
    return;
  }
  $app.innerHTML = `
    <h1>Registrar asistencia</h1>
    <p><a href="#/asistencia/importar">Importar lista pegada (WhatsApp)</a></p>
    <label>Actividad</label>
    <select id="asis-actividad">${opcionesActividades(actividades)}</select>
    <div id="asis-otro-slot"></div>
    <label>Fecha</label>
    <input type="date" id="asis-fecha" value="${new Date().toISOString().slice(0, 10)}">
    <button class="primary" id="asis-iniciar">Iniciar registro</button>
    <div id="asis-body"></div>
  `;
  wireOtroManual("asis-actividad", "asis-otro-slot");
  document.getElementById("asis-iniciar").addEventListener("click", iniciarRegistroAsistencia);
});

// Detección de 2da visita (Batch C, pedido del usuario): la primera vez
// que alguien asiste su ficha suele estar casi vacía — recién es evidente
// que se va a quedar en el grupo cuando vuelve una segunda vez. Solo
// informa y enlaza a la ficha; nunca decide nada por su cuenta.
function avisarSiSegundaVisita(registro) {
  if (registro.total_asistencias_persona !== 2) return;
  const slot = document.getElementById("avisos-2da-visita");
  if (!slot) return;
  slot.insertAdjacentHTML(
    "afterbegin",
    `<div class="aviso-info">Es la 2da vez que asiste <strong>${registro.persona_nombre}</strong> —
      <a href="#/personas/ver?id=${registro.persona_id}">completar su ficha</a></div>`
  );
}

function filaAsistencia(registro) {
  const li = document.createElement("li");
  li.innerHTML = `<span>✓ ${registro.persona_nombre}</span> <button type="button" class="quitar-asis" aria-label="Quitar a ${registro.persona_nombre}">✕</button>`;
  li.querySelector(".quitar-asis").addEventListener("click", async () => {
    if (!confirm(`¿Quitar a ${registro.persona_nombre} de esta asistencia?`)) return;
    try {
      await Api.quitarAsistencia(registro.id);
      li.remove();
      const contador = document.getElementById("conteo-asistieron");
      contador.textContent = Math.max(0, Number(contador.textContent) - 1);
    } catch (e) {
      alert(`No se pudo quitar: ${e.message}`);
    }
  });
  return li;
}

async function iniciarRegistroAsistencia() {
  const actividadId = Number(document.getElementById("asis-actividad").value);
  const fecha = document.getElementById("asis-fecha").value;
  const nombreEvento = nombreEventoElegido("asis-actividad");
  const body = document.getElementById("asis-body");
  body.innerHTML = `<p class="hint">Cargando...</p>`;

  let evento;
  try {
    evento = await Api.crearOReusarEvento({ actividad_id: actividadId, nombre: `${nombreEvento} ${fecha}`, fecha });
  } catch (e) {
    body.innerHTML = `<div class="error">${e.message}</div>`;
    return;
  }

  const marcados = new Set();

  body.innerHTML = `
    <h2>Buscar joven</h2>
    <div id="buscador-slot"></div>
    <div id="avisos-2da-visita"></div>
    <h2>Asistieron (<span id="conteo-asistieron">0</span>)</h2>
    <ul class="lista-asistieron" id="lista-asistieron"></ul>
    <button class="secundario" id="asis-finalizar" type="button">Finalizar registro</button>
    <div id="asis-finalizar-msg"></div>
  `;

  async function cargarInicial() {
    const registros = await Api.verAsistenciaEvento(evento.id);
    const ul = document.getElementById("lista-asistieron");
    document.getElementById("conteo-asistieron").textContent = registros.length;
    ul.innerHTML = "";
    if (!registros.length) {
      ul.innerHTML = `<li class="hint">Nadie registrado todavía.</li>`;
    }
    for (const r of registros) {
      marcados.add(r.persona_id);
      ul.appendChild(filaAsistencia(r));
    }
  }

  const buscador = crearBuscadorPersonas({
    placeholder: "Nombre del joven...",
    onSeleccionar: async (candidato) => {
      if (marcados.has(candidato.persona_id)) {
        alert(`${candidato.nombre_completo} ya está registrado en este evento.`);
        return;
      }
      try {
        const registro = await Api.registrarAsistencia({ persona_id: candidato.persona_id, evento_id: evento.id, presente: true });
        marcados.add(candidato.persona_id);
        const ul = document.getElementById("lista-asistieron");
        const placeholder = ul.querySelector(".hint");
        if (placeholder) placeholder.remove();
        ul.prepend(filaAsistencia(registro));
        document.getElementById("conteo-asistieron").textContent =
          Number(document.getElementById("conteo-asistieron").textContent) + 1;
        avisarSiSegundaVisita(registro);
      } catch (e) {
        alert(`No se pudo registrar: ${e.message}`);
      }
    },
  });
  document.getElementById("buscador-slot").appendChild(buscador);

  document.getElementById("asis-finalizar").addEventListener("click", () => {
    document.getElementById("asis-finalizar-msg").innerHTML = `
      <div class="card">Listo — ${marcados.size} joven${marcados.size === 1 ? "" : "es"} registrado${marcados.size === 1 ? "" : "s"} para "${evento.nombre}". Ya quedó guardado; podés seguir agregando o salir cuando quieras.</div>
    `;
  });

  await cargarInicial();
}

// --- Importar lista pegada (WhatsApp) ---
Router.on("/asistencia/importar", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `<p class="hint">Cargando actividades...</p>`;
  let actividades;
  try {
    actividades = await Api.actividades();
  } catch (e) {
    $app.innerHTML = `<div class="error">${e.message}</div>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/asistencia", "Asistencia")}
    <h1>Importar lista de asistencia</h1>
    <p class="hint">Pega el mensaje tal cual llega por WhatsApp. La primera línea con la palabra "asistencia" se ignora automáticamente.</p>
    <label>Actividad</label>
    <select id="imp-actividad">${opcionesActividades(actividades)}</select>
    <div id="imp-otro-slot"></div>
    <label>Fecha</label>
    <input type="date" id="imp-fecha" value="${new Date().toISOString().slice(0, 10)}">
    <label>Lista pegada</label>
    <textarea id="imp-texto" rows="8" placeholder="asistencia culto juvenil 25/07/2026&#10;Sofia Hernandez&#10;Camila Rodriguez&#10;..."></textarea>
    <button class="primary" id="imp-procesar">Procesar</button>
    <div id="imp-resultado"></div>
  `;
  wireOtroManual("imp-actividad", "imp-otro-slot");
  document.getElementById("imp-procesar").addEventListener("click", procesarListaImportada);
});

async function procesarListaImportada() {
  const actividad_id = Number(document.getElementById("imp-actividad").value);
  const fecha = document.getElementById("imp-fecha").value;
  const nombre_evento = nombreEventoElegido("imp-actividad");
  const texto = document.getElementById("imp-texto").value;
  const resultado = document.getElementById("imp-resultado");
  resultado.innerHTML = `<p class="hint">Procesando...</p>`;

  let preview;
  try {
    preview = await Api.previewImportarLista({ actividad_id, fecha, texto, nombre_evento });
  } catch (e) {
    resultado.innerHTML = `<div class="error">${e.message}</div>`;
    return;
  }

  if (!preview.filas.length) {
    resultado.innerHTML = `<p class="hint">No se reconoció ningún nombre en el texto pegado.</p>`;
    return;
  }

  const encontradas = preview.filas.filter((f) => f.confianza === "ALTA" && f.candidatos.length);
  const pendientes = preview.filas.filter((f) => !(f.confianza === "ALTA" && f.candidatos.length));

  resultado.innerHTML = `
    <h2>Coincidencias encontradas (${encontradas.length})</h2>
    <div id="imp-encontradas"></div>
    <h2>Pendientes por confirmar (${pendientes.length})</h2>
    <div id="imp-pendientes"></div>
    <button class="primary" id="imp-guardar">Guardar asistencia</button>
    <div id="imp-guardar-resultado"></div>
  `;

  const $encontradas = document.getElementById("imp-encontradas");
  const $pendientes = document.getElementById("imp-pendientes");

  preview.filas.forEach((fila, idx) => {
    const destino = encontradas.includes(fila) ? $encontradas : $pendientes;
    destino.appendChild(renderFilaImportada(fila, idx));
  });

  document.getElementById("imp-guardar").addEventListener("click", async () => {
    const seleccionados = new Set();
    document.querySelectorAll('#imp-resultado input[type=radio]:checked').forEach((input) => {
      if (input.value) seleccionados.add(Number(input.value));
    });
    const $out = document.getElementById("imp-guardar-resultado");
    if (!seleccionados.size) {
      $out.innerHTML = `<p class="hint">No hay nadie seleccionado para guardar.</p>`;
      return;
    }
    try {
      const r = await Api.confirmarImportarLista({
        evento_id: preview.evento.id,
        persona_ids: [...seleccionados],
      });
      $out.innerHTML = `<div class="card">Guardados: ${r.guardados} · Ya estaban registrados: ${r.ya_registrados}</div>`;
    } catch (e) {
      $out.innerHTML = `<div class="error">${e.message}</div>`;
    }
  });
}

function renderFilaImportada(fila, idx) {
  const div = document.createElement("div");
  div.className = "card";
  const opciones = fila.candidatos
    .map(
      (c, i) => `
    <label class="hint" style="display:block;font-weight:normal;">
      <input type="radio" name="fila-${idx}" value="${c.persona_id}" ${fila.confianza === "ALTA" && i === 0 ? "checked" : ""}>
      ${c.nombre_completo} (${Math.round(c.score)}%)
    </label>
  `
    )
    .join("");
  div.innerHTML = `
    <div><strong>"${fila.texto_original}"</strong> <span class="badge ${fila.confianza}">${fila.confianza}</span></div>
    ${opciones || `<p class="hint">Sin coincidencias — puede ser un joven nuevo.</p>`}
    <label class="hint" style="display:block;font-weight:normal;">
      <input type="radio" name="fila-${idx}" value="" ${!(fila.confianza === "ALTA" && fila.candidatos.length) ? "checked" : ""}>
      Ignorar esta línea
    </label>
  `;
  return div;
}

// --- Agregar joven ---
Router.on("/personas/nueva", async () => {
  if (!requiereSesion()) return;
  const [generos, actividades] = await Promise.all([
    Api.catalogo("genero").catch(() => []),
    Api.actividades().catch(() => []),
  ]);
  const opcionesGenero = generos.map((c) => `<option value="${c.valor}">${c.valor}</option>`).join("");
  $app.innerHTML = `
    <h1>Agregar joven</h1>
    <form id="form-persona">
      <label>Nombres *</label>
      <input type="text" name="nombres" required>
      <label>Apellidos *</label>
      <input type="text" name="apellidos" required>
      <label>Fecha de nacimiento</label>
      <input type="date" name="fecha_nacimiento">
      <label>Teléfono</label>
      <input type="tel" name="telefono">
      <label>Género</label>
      <select name="genero">
        <option value="">-- Seleccionar --</option>
        ${opcionesGenero}
      </select>
      <label>¿Bautizado?</label>
      <select name="bautizado">
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
      <label>Dirección</label>
      <input type="text" name="direccion">
      <label>¿Quién lo invitó?</label>
      <p class="hint">Para el ranking de invitaciones — opcional.</p>
      <div id="invitador-slot"></div>
      <div id="invitador-elegido" class="hint"></div>
      <label>Notas</label>
      <textarea name="notas" rows="3"></textarea>
      <button class="primary" type="submit">Guardar</button>
      <div class="error" id="persona-error"></div>
      <div id="persona-ok"></div>
    </form>
  `;

  let invitadoPorId = null;
  const buscadorInvitador = crearBuscadorPersonas({
    placeholder: "Buscar quién lo invitó...",
    onSeleccionar: (candidato) => {
      invitadoPorId = candidato.persona_id;
      document.getElementById("invitador-elegido").textContent = `Invitado por: ${candidato.nombre_completo} (tocá "Agregar joven" de nuevo para cambiar)`;
    },
  });
  document.getElementById("invitador-slot").appendChild(buscadorInvitador);

  document.getElementById("form-persona").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    data.bautizado = data.bautizado === "true";
    for (const campo of ["fecha_nacimiento", "telefono", "genero", "direccion", "notas"]) {
      if (data[campo] === "") delete data[campo];
    }
    if (invitadoPorId) data.invitado_por_id = invitadoPorId;
    const errorBox = document.getElementById("persona-error");
    errorBox.textContent = "";
    try {
      const persona = await Api.crearPersona(data);
      document.getElementById("persona-ok").innerHTML = `
        <div class="card">Guardado: <strong>${persona.nombres} ${persona.apellidos}</strong> (${persona.id_unico})<br>
         <span class="hint">Fecha de ingreso registrada automáticamente: ${persona.fecha_ingreso}</span></div>
        ${
          actividades.length
            ? `<div class="card">
                 <strong>¿A qué evento asistió?</strong>
                 <p class="hint">Registralo/a de una vez en la asistencia de hoy — queda guardado a qué evento asistió por primera vez.</p>
                 <label>Actividad</label>
                 <select id="nueva-persona-actividad">${opcionesActividades(actividades)}</select>
                 <div id="nueva-persona-otro-slot"></div>
                 <label>Fecha</label>
                 <input type="date" id="nueva-persona-fecha" value="${new Date().toISOString().slice(0, 10)}">
                 <button class="primary" type="button" id="btn-anadir-asistencia">Añadir a asistencia</button>
                 <div id="anadir-asistencia-resultado"></div>
               </div>`
            : ""
        }
      `;
      form.reset();
      invitadoPorId = null;
      document.getElementById("invitador-elegido").textContent = "";

      if (actividades.length) {
        wireOtroManual("nueva-persona-actividad", "nueva-persona-otro-slot");
        document.getElementById("btn-anadir-asistencia").addEventListener("click", async () => {
          const actividadId = Number(document.getElementById("nueva-persona-actividad").value);
          const fecha = document.getElementById("nueva-persona-fecha").value;
          const nombreEvento = nombreEventoElegido("nueva-persona-actividad");
          const resultado = document.getElementById("anadir-asistencia-resultado");
          resultado.innerHTML = `<p class="hint">Guardando...</p>`;
          try {
            const evt = await Api.crearOReusarEvento({ actividad_id: actividadId, nombre: `${nombreEvento} ${fecha}`, fecha });
            await Api.registrarAsistencia({ persona_id: persona.id, evento_id: evt.id, presente: true });
            resultado.innerHTML = `<div class="card">Listo — quedó registrada/o en "${evt.nombre}".</div>`;
          } catch (err) {
            resultado.innerHTML = `<div class="error">${err.message}</div>`;
          }
        });
      }
    } catch (e2) {
      errorBox.textContent = `No se pudo guardar: ${e2.message}`;
    }
  });
});

Router.on("/404", () => {
  $app.innerHTML = `<p>Página no encontrada.</p>`;
});

if (!location.hash) {
  location.hash = Api.isAuthenticated() ? "#/panel" : "#/login";
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
