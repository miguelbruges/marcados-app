const $app = document.getElementById("app");
const $tabbar = document.getElementById("tabbar");
const $btnSalir = document.getElementById("btn-salir");
const $btnAdminGear = document.getElementById("btn-admin-gear");

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
  Router.navegar("/login");
});

// --- Login ---
Router.on("/login", () => {
  $tabbar.hidden = true;
  $btnSalir.hidden = true;
  $btnAdminGear.hidden = true;
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
  const esAdmin = Api.rol() === "admin";
  $btnAdminGear.hidden = !esAdmin;

  $app.innerHTML = `
    <h1>Hola, ${Api.nombre()}</h1>
    <div class="grid-kpi" id="grid-kpi"></div>
    <div id="semaforo-slot"></div>
  `;

  try {
    const [resumen, activosCrudo, inactivosCrudo, bautizados30d] = await Promise.all([
      Api.dashboardResumen(),
      Api.personas(true),
      Api.personas(false),
      Api.asistieron30Dias(),
    ]);
    // PersonaOut no trae nombre_completo (solo nombres/apellidos por separado) —
    // se completa acá para que las listas de las tarjetas puedan mostrar un nombre.
    const conNombreCompleto = (p) => ({ ...p, nombre_completo: `${p.nombres} ${p.apellidos}` });
    const activos = activosCrudo.map(conNombreCompleto);
    const inactivos = inactivosCrudo.map(conNombreCompleto);
    const todas = activos.concat(inactivos);
    pintarKpis([
      { label: "Total jóvenes", valor: resumen.total_jovenes, personas: todas, etiqueta: (p) => (p.activo ? "activo" : "inactivo"), filtro: null },
      { label: "Activos", valor: resumen.activos, personas: activos, etiqueta: () => "activo", filtro: "activos" },
      { label: "Bautizados", valor: resumen.bautizados, personas: todas.filter((p) => p.bautizado), etiqueta: () => "bautizado", filtro: "bautizados" },
      { label: "Sirviendo", valor: resumen.sirviendo, personas: todas.filter((p) => p.servidor), etiqueta: () => "servidor", filtro: "servidores" },
      { label: "Asistieron · 30 días", valor: resumen.asistieron_ultimos_30_dias, personas: bautizados30d, etiqueta: () => "asistió", vacioTexto: "Nadie todavía en los últimos 30 días.", filtro: "asistio30" },
    ]);
  } catch (e) {
    document.getElementById("grid-kpi").innerHTML = `<div class="error">${e.message}</div>`;
  }

  if (tieneAccesoPastoral()) {
    await cargarSemaforo(30);
  }
});

// --- Semáforo de asistencia: período configurable + pastillas que se abren
// para mostrar quiénes están detrás del número (pedido del usuario, 2026-08-11) ---
const PERIODOS_SEMAFORO = [7, 15, 30, 60, 90];
let semaforoNivelAbierto = null;

async function cargarSemaforo(ventanaDias) {
  const slot = document.getElementById("semaforo-slot");
  if (!slot) return;
  semaforoNivelAbierto = null;
  slot.innerHTML = `<p class="hint">Cargando semáforo...</p>`;
  try {
    const a = await Api.alertasResumen(ventanaDias);
    slot.innerHTML = `
      <div class="card semaforo">
        <h2 style="margin-top:0">Semáforo de asistencia</h2>
        <p class="aclaracion">Alerta operativa, no una conclusión pastoral — la decisión siempre la toma una persona. Tocá un color para ver quiénes son.</p>
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

// Tarjetas KPI del panel: se tocan y se abren mostrando la lista de
// personas detrás del número — antes solo se veía el total.
function pintarKpis(items) {
  const grid = document.getElementById("grid-kpi");
  grid.innerHTML = "";
  items.forEach((item, idx) => {
    const nombres = item.personas.slice(0, 6);
    const art = document.createElement("article");
    art.className = "kpi";
    art.dataset.abierto = "false";
    const idDet = `kpi-detalle-${idx}`;
    const hrefVerTodos = item.filtro ? `#/personas?filtro=${item.filtro}` : "#/personas";
    const contenidoLista = nombres.length
      ? `<ul class="kpi-lista">${nombres
          .map((p) => `<li>${p.nombre_completo}<span class="badge ALTA">${item.etiqueta(p)}</span></li>`)
          .join("")}</ul>
         ${item.personas.length > nombres.length ? `<a class="kpi-vertodos" href="${hrefVerTodos}">Ver los ${item.personas.length} completos →</a>` : ""}`
      : `<p class="kpi-vacio">${item.vacioTexto || "Nadie en esta categoría todavía."}</p>`;
    art.innerHTML = `
      <button class="kpi-cabecera" type="button" aria-expanded="false" aria-controls="${idDet}">
        <span class="kpi-num">${item.valor}</span>
        <span class="kpi-meta">
          <span class="kpi-label">${item.label}</span>
          <span class="kpi-flecha"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
        </span>
      </button>
      <div class="kpi-detalle" id="${idDet}"><div class="kpi-detalle-int">${contenidoLista}</div></div>
    `;
    art.querySelector("button.kpi-cabecera").addEventListener("click", () => {
      const abierto = art.dataset.abierto === "true";
      art.dataset.abierto = abierto ? "false" : "true";
      art.querySelector("button.kpi-cabecera").setAttribute("aria-expanded", String(!abierto));
    });
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
      <a class="fila-admin" href="#" id="btn-exportar-excel">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10M8 10l4 4 4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
        <span class="fila-admin-texto"><strong>Descargar Excel</strong><small>Exporta con el diseño del libro real</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
      <a class="fila-admin" href="#/admin/migracion">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
        <span class="fila-admin-texto"><strong>Cargar datos iniciales del Excel</strong><small>Solo la primera vez — sube el Excel real para poblar la app. Se niega si ya hay personas</small></span>
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
});

// --- Carga inicial: subir el Excel real (solo admin) ---
Router.on("/admin/migracion", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/admin", "Administración")}
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

Router.on("/personas", async () => {
  if (!requiereSesion()) return;
  const filtro = Router.query().get("filtro");
  const etiqueta = etiquetaFiltroPersonas(filtro);
  $app.innerHTML = `
    <h1>Jóvenes registrados</h1>
    ${etiqueta ? `<p class="hint">Mostrando: <strong>${etiqueta}</strong> — <a href="#/personas">quitar filtro</a></p>` : ""}
    <p>
      <a href="#/servidores/nuevo">+ Marcar nuevo servidor (reunión STAFF)</a><br>
      <a href="#/personas/incompletas">Ver fichas incompletas</a><br>
      <a href="#/invitaciones">Ranking de invitaciones</a>
    </p>
    <div id="lista-personas" class="hint">Cargando...</div>
  `;
  try {
    const [activas, inactivas] = await Promise.all([Api.personas(true), Api.personas(false)]);
    let personas = activas.concat(inactivas);
    if (filtro === "activos") personas = activas;
    else if (filtro === "inactivos") personas = inactivas;
    else if (filtro === "bautizados") personas = personas.filter((p) => p.bautizado);
    else if (filtro === "servidores") personas = personas.filter((p) => p.servidor);
    else if (filtro === "asistio30") {
      const asistieron = await Api.asistieron30Dias();
      const ids = new Set(asistieron.map((p) => p.id));
      personas = personas.filter((p) => ids.has(p.id));
    }
    const cont = document.getElementById("lista-personas");
    if (!personas.length) {
      cont.innerHTML = `<p class="hint">${etiqueta ? "Nadie en esta categoría todavía." : "Todavía no hay jóvenes registrados."}</p>`;
      return;
    }
    cont.innerHTML = personas
      .map(
        (p) => `
      <a class="card-link" href="#/personas/ver?id=${p.id}">
      <div class="card">
        <strong>${p.nombres} ${p.apellidos}</strong>${badgeFicha(p)}
        <div class="hint">
          ${p.id_unico}${p.estado ? " · " + p.estado : ""}${p.bautizado ? " · bautizado" : ""}
          ${p.servidor ? " · servidor" + (p.fecha_inicio_servicio ? ` desde ${p.fecha_inicio_servicio}` : "") : ""}
        </div>
        <div class="hint">Ingresó: ${p.fecha_ingreso || "—"}</div>
      </div>
      </a>
    `
      )
      .join("");
  } catch (e) {
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
async function cargarCatalogosFicha() {
  const tipos = [...new Set(
    CAMPOS_EDITABLES_FICHA.filter(([, , tipo]) => tipo.startsWith("catalogo:")).map(([, , tipo]) => tipo.split(":")[1])
  )];
  const resultados = await Promise.all(tipos.map((t) => Api.catalogo(t).catch(() => [])));
  const mapa = {};
  tipos.forEach((t, i) => (mapa[t] = resultados[i]));
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
    renderFicha(persona, alertas, seguimientos, catalogos, areasDisponibles);
  } catch (e) {
    $app.innerHTML = `<div class="error">${e.message}</div>`;
  }
});

// Tipos fijos de contacto pastoral — no es un catálogo administrable desde
// Excel, es una lista corta y estable (pedido del usuario, 2026-08-12).
const TIPOS_SEGUIMIENTO = ["Llamada", "Visita", "Mensaje", "Reunión personal", "Oración", "Otro"];

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

    <h2>Datos</h2>
    <form id="form-ficha"></form>
    <button id="btn-editar-ficha" class="secundario">Editar</button>
    <div class="error" id="ficha-error"></div>

    ${seccionSeguimiento}
  `;

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
Router.on("/servidores/nuevo", () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    ${botonAtras("/personas", "Jóvenes")}
    <h1>Nuevo servidor</h1>
    <p class="hint">Para la reunión de servidores (STAFF): busca al joven y tócalo para marcarlo como servidor con esta fecha.</p>
    <label>Fecha de integración</label>
    <input type="date" id="serv-fecha" value="${new Date().toISOString().slice(0, 10)}">
    <label>Buscar joven</label>
    <div id="serv-buscador-slot"></div>
    <h2>Marcados hoy en esta sesión</h2>
    <ul class="lista-asistieron" id="serv-lista"><li class="hint">Nadie todavía.</li></ul>
  `;

  const buscador = crearBuscadorPersonas({
    placeholder: "Nombre del joven...",
    onSeleccionar: async (candidato) => {
      const fecha = document.getElementById("serv-fecha").value;
      try {
        await Api.marcarServidor(candidato.persona_id, fecha);
        const ul = document.getElementById("serv-lista");
        const placeholder = ul.querySelector(".hint");
        if (placeholder) placeholder.remove();
        const li = document.createElement("li");
        li.textContent = `✓ ${candidato.nombre_completo} — servidor desde ${fecha}`;
        ul.prepend(li);
      } catch (e) {
        alert(`No se pudo marcar: ${e.message}`);
      }
    },
  });
  document.getElementById("serv-buscador-slot").appendChild(buscador);
});

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
  const generos = await Api.catalogo("genero").catch(() => []);
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
      document.getElementById("persona-ok").innerHTML =
        `<div class="card">Guardado: <strong>${persona.nombres} ${persona.apellidos}</strong> (${persona.id_unico})<br>
         <span class="hint">Fecha de ingreso registrada automáticamente: ${persona.fecha_ingreso}</span></div>`;
      form.reset();
      invitadoPorId = null;
      document.getElementById("invitador-elegido").textContent = "";
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
