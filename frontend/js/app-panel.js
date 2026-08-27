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
      const [resumen, activosCrudo, inactivosCrudo] = await Promise.all([
        Api.dashboardResumen(),
        Api.personas(true),
        Api.personas(false),
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
        { label: "Activos", valor: resumen.activos, personas: todas.filter((p) => p.estado === "Activo"), etiqueta: (p) => p.estado, vacioTexto: "Nadie con estado Activo todavía — se marca desde la ficha de cada joven.", filtro: "activos", resaltar: "campo-estado" },
        { label: "Bautizados", valor: resumen.bautizados, personas: todas.filter((p) => p.bautizado), etiqueta: () => "bautizado", filtro: "bautizados", resaltar: "bautizado-slot" },
        { label: "Sirviendo", valor: resumen.sirviendo, personas: todas.filter((p) => p.servidor), etiqueta: () => "servidor", filtro: "servidores", resaltar: "servicio-slot" },
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
// Sin 7 días: el grupo se reúne una vez por semana, así que en esa ventana
// casi nunca había Encuentros suficientes y la pestaña mostraba "sin datos"
// siempre — estructuralmente no podía servir de nada (pedido del usuario,
// 2026-08-24).
const PERIODOS_SEMAFORO = [15, 30, 60, 90];
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
          hubo ningún Encuentro cargado — no que a alguien le falte historial. Ojo: con un solo Encuentro en el
          período, el color sale de esa única reunión, así que leelo con pinzas. Alerta operativa, no una
          conclusión pastoral — la decisión siempre la toma una persona. Tocá un color para ver quiénes son.
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
    <p class="hint">Tres listas de cosas para revisar, juntas para no tener que buscarlas por separado. Todo esto es información operativa — nunca una conclusión sobre nadie.</p>
    <div id="alertas-cuerpo"><p class="hint">Cargando...</p></div>
  `;

  function seccion(titulo, cantidad, explicacion, cuerpo, textoVacio) {
    return `
      <section class="alertas-seccion ${cantidad ? "" : "vacia"}">
        <h2 class="alertas-titulo">${titulo} <span class="alertas-cuenta">${cantidad}</span></h2>
        <p class="alertas-explica">${explicacion}</p>
        ${cantidad ? cuerpo : `<p class="hint">${textoVacio}</p>`}
      </section>
    `;
  }

  try {
    const [rojos, incompletas, atencion] = await Promise.all([
      Api.alertasDetalle("rojo"),
      Api.fichasIncompletas(),
      Api.seguimientosRequierenAtencion(),
    ]);
    if (!Router.vigente(miToken)) return;

    const htmlRojos = `<ul class="lista-alertas">${rojos
      .map(
        (p) => `
      <li>
        <span class="alerta-cuerpo">
          <a class="alerta-nombre" href="#/personas/ver?id=${p.id}">${p.nombre_completo}</a>
          <span class="alerta-meta">${p.id_unico || ""}</span>
        </span>
      </li>`
      )
      .join("")}</ul>`;

    const htmlIncompletas = `<ul class="lista-alertas">${incompletas
      .map(
        (p) => `
      <li>
        <span class="alerta-cuerpo">
          <a class="alerta-nombre" href="#/personas/ver?id=${p.id}">${p.nombre_completo}</a>
          <span class="alerta-meta">Faltan: ${(p.datos_faltantes || []).join(", ") || "—"}</span>
        </span>
        <span class="alerta-pct badge ${nivelFicha(p.ficha_completa_pct)}">${p.ficha_completa_pct}%</span>
      </li>`
      )
      .join("")}</ul>`;

    // Se muestra el texto de la nota y quién/qué la marcó: sin eso la lista
    // era solo nombres y fechas repetidas, sin decir qué había que hacer
    // (reportado por el usuario, 2026-08-24).
    const htmlAtencion = `<ul class="lista-alertas" id="lista-atencion">${atencion
      .map(
        (s) => `
      <li data-seguimiento="${s.id}">
        <span class="alerta-cuerpo">
          <a class="alerta-nombre" href="#/personas/ver?id=${s.persona_id}">${s.persona_nombre}</a>
          <span class="alerta-meta">${s.fecha}${s.tipo ? ` · ${s.tipo}` : ""} — ${s.notas || ""}</span>
        </span>
        <button type="button" class="btn-resolver" data-resolver="${s.id}">Resuelto</button>
      </li>`
      )
      .join("")}</ul>`;

    document.getElementById("alertas-cuerpo").innerHTML =
      seccion(
        "Semáforo en rojo · 30 días",
        rojos.length,
        'Asistieron a menos de la mitad de los Encuentros de los últimos 30 días. Es un dato de asistencia para saber a quién buscar — no dice nada de la persona.',
        htmlRojos,
        "Nadie en rojo ahora mismo."
      ) +
      seccion(
        "Fichas incompletas",
        incompletas.length,
        "Les faltan datos básicos de contacto o de emergencia. El porcentaje es cuánto de la ficha está lleno; abrí a la persona para completar lo que dice que falta.",
        htmlIncompletas,
        "Todas las fichas activas están por encima del umbral."
      ) +
      seccion(
        "Seguimientos que requieren atención",
        atencion.length,
        'Notas de seguimiento pastoral que alguien del equipo marcó como "requiere atención" al escribirlas, más las que dejó la importación del Excel cuando un dato necesitaba decisión humana (por ejemplo, dos jóvenes con el mismo teléfono). Son cosas para revisar y conversar, no alertas automáticas. Cuando ya la resolviste, tocá <strong>Resuelto</strong>: baja la marca y sale de esta lista, pero la nota queda en el historial de la persona.',
        htmlAtencion,
        "Nada pendiente."
      );

    document.querySelectorAll("[data-resolver]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "...";
        try {
          await Api.resolverSeguimiento(Number(btn.dataset.resolver));
          const fila = btn.closest("li");
          fila.remove();
          const seccionEl = document.getElementById("lista-atencion");
          const restantes = seccionEl ? seccionEl.querySelectorAll("li").length : 0;
          const cuenta = seccionEl?.closest(".alertas-seccion")?.querySelector(".alertas-cuenta");
          if (cuenta) cuenta.textContent = restantes;
          if (!restantes && seccionEl) {
            seccionEl.closest(".alertas-seccion").classList.add("vacia");
            seccionEl.outerHTML = `<p class="hint">Nada pendiente.</p>`;
          }
          actualizarBadgeAlertas();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Resuelto";
          alert(`No se pudo resolver: ${err.message}`);
        }
      });
    });
  } catch (e) {
    if (!Router.vigente(miToken)) return;
    document.getElementById("alertas-cuerpo").innerHTML = `<div class="error">${e.message}</div>`;
  }
});

// Tarjetas KPI del panel: se tocan y se abren mostrando la lista de
// personas detrás del número — antes solo se veía el total.
const KPI_PREVIA_LIMITE = 6;

function listaKpiHtml(personas, etiqueta, sinResultadosTexto, resaltar) {
  if (!personas.length) return `<p class="kpi-vacio">${sinResultadosTexto}</p>`;
  const sufijoResaltar = resaltar ? `&resaltar=${resaltar}` : "";
  return `<ul class="kpi-lista">${personas
    .map(
      (p) =>
        `<li><a href="#/personas/ver?id=${p.id}${sufijoResaltar}">${p.nombre_completo}<span class="badge ALTA">${etiqueta(p)}</span></a></li>`
    )
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
      ? `<input type="search" class="kpi-buscador" placeholder="Buscar..." autocomplete="off">`
      : "";
    const listaHtml = listaKpiHtml(item.personas.slice(0, KPI_PREVIA_LIMITE), item.etiqueta, vacioTexto, item.resaltar);
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
          $listaSlot.innerHTML = listaKpiHtml(item.personas.slice(0, KPI_PREVIA_LIMITE), item.etiqueta, vacioTexto, item.resaltar);
          $verTodosSlot.innerHTML = linkVerTodosHtml;
          return;
        }
        const encontradas = item.personas.filter((p) => normalizarTexto(p.nombre_completo).includes(q));
        $listaSlot.innerHTML = listaKpiHtml(encontradas, item.etiqueta, `Nadie coincide con "${e.target.value.trim()}".`, item.resaltar);
        $verTodosSlot.innerHTML = "";
      });
    }
    grid.appendChild(art);
  });
}

