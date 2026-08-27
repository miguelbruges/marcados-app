// --- Ver jóvenes registrados ---
function etiquetaFiltroPersonas(filtro) {
  return {
    activos: "Activos",
    // "inactivos" filtra por ficha ARCHIVADA (activo=false), no por el
    // estado Activo/Inactivo/Fluctúa — la etiqueta lo dice para que no se
    // confundan los dos conceptos, que ya se mezclaron antes.
    inactivos: "Fichas archivadas",
    bautizados: "Bautizados",
    servidores: "Sirviendo",
  }[filtro] || null;
}

function stat(num, label) {
  return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

function filaPersona(p) {
  // La ficha archivada se marca: desde que se pueden juntar duplicados
  // (2026-08-24) archivar es algo habitual, y sin este aviso las fichas
  // absorbidas seguían apareciendo iguales a las vivas — se veía como si la
  // fusión no hubiera hecho nada.
  const archivada = p.activo === false ? `<span class="badge BAJA">archivada</span>` : "";
  return `
    <a class="card-link" href="#/personas/ver?id=${p.id}">
    <div class="card${p.activo === false ? " card-archivada" : ""}">
      <strong>${p.nombres} ${p.apellidos}</strong>${badgeFicha(p)}${archivada}
      <div class="hint">
        ${p.id_unico}${p.estado ? " · " + p.estado : ""}${p.bautizado ? " · bautizado" : ""}
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
      <a class="acceso-rapido" href="#/personas/pendientes-revision">
        <span class="acceso-rapido-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>
        Pendientes por revisar
      </a>
      <a class="acceso-rapido" href="#/personas/duplicados">
        <span class="acceso-rapido-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></span>
        Posibles duplicados
      </a>
    </div>
    <div id="lista-personas" class="hint">Cargando...</div>
  `;
  try {
    const [activas, inactivas] = await Promise.all([Api.personas(true), Api.personas(false)]);
    if (!Router.vigente(miToken)) return;
    // Sin filtro se listan solo las fichas vivas. Antes se concatenaban las
    // archivadas y quedaban mezcladas sin distinción — con la fusión de
    // duplicados eso significaba seguir viendo cinco "José Pacheco" después
    // de haberlos juntado. Las archivadas siguen a un toque, en su filtro.
    let personas = activas;
    if (filtro === "activos") personas = activas.filter((p) => p.estado === "Activo");
    else if (filtro === "inactivos") personas = inactivas;
    else if (filtro === "bautizados") personas = activas.filter((p) => p.bautizado);
    else if (filtro === "servidores") personas = activas.filter((p) => p.servidor);

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

// Teléfonos y correos tocables desde la ficha (pedido del usuario,
// 2026-08-24): la app se usa desde el celular en medio de una reunión, y
// hasta ahora el número había que memorizarlo o copiarlo a mano para poder
// llamar. tel: abre el marcador y mailto: el correo; en escritorio, si no
// hay app asociada, el enlace simplemente no hace nada — nunca rompe la
// ficha ni pierde el dato, que se sigue viendo igual.
const CAMPOS_TELEFONO = new Set(["telefono", "telefono_emergencia"]);

function valorFichaHtml(campo, valor) {
  if (!valor) return "—";
  if (CAMPOS_TELEFONO.has(campo)) {
    // El href se limpia (sin espacios ni guiones) para que el marcador lo
    // entienda; el texto visible queda tal cual lo cargaron.
    const limpio = String(valor).replace(/[^\d+]/g, "");
    if (!limpio) return valor;
    return `<a class="enlace-contacto" href="tel:${limpio}">${valor}</a>`;
  }
  if (campo === "correo_electronico" && String(valor).includes("@")) {
    return `<a class="enlace-contacto" href="mailto:${valor}">${valor}</a>`;
  }
  return valor;
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
    resaltarSeccionFicha(Router.query().get("resaltar"));
  } catch (e) {
    if (!Router.vigente(miToken)) return;
    $app.innerHTML = `<div class="error">${e.message}</div>`;
  }
});

// Al llegar desde una tarjeta del Panel (ej. "Sirviendo"), señala en la
// ficha justo la parte que corresponde a ese desglose en vez de dejar que
// el usuario la busque a mano (pedido del usuario, 2026-08-13).
function resaltarSeccionFicha(idSeccion) {
  if (!idSeccion) return;
  const el = document.getElementById(idSeccion);
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("resaltado");
    setTimeout(() => el.classList.remove("resaltado"), 2200);
  });
}

// Tipos fijos de contacto pastoral — no es un catálogo administrable desde
// Excel, es una lista corta y estable (pedido del usuario, 2026-08-12).
const TIPOS_SEGUIMIENTO = ["Llamada", "Visita", "Mensaje", "Reunión personal", "Oración", "Otro"];

// --- Bautizado: mismo patrón de toggle que servidor. Hacía falta un
// control acá porque antes bautizado solo se podía fijar al crear la
// persona — sin esto no había forma de reconfirmarlo desde la ficha
// después del reinicio a False (pedido del usuario, 2026-08-13). ---
function pintarBautizado(persona) {
  const slot = document.getElementById("bautizado-slot");
  if (!slot) return;
  const texto = persona.bautizado
    ? `<strong>Bautizado</strong><small>Confirmado</small>`
    : `<strong>Sin confirmar</strong><small>Todavía no se marcó como bautizado</small>`;
  const boton = persona.bautizado
    ? `<button type="button" class="btn-servidor quitar" id="btn-toggle-bautizado">Quitar bautizado</button>`
    : `<button type="button" class="btn-servidor marcar" id="btn-toggle-bautizado">Marcar como bautizado</button>`;
  slot.innerHTML = `<div class="servicio-card"><div class="servicio-card-texto">${texto}</div>${boton}</div>`;

  document.getElementById("btn-toggle-bautizado").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const actualizada = await Api.editarPersona(persona.id, { bautizado: !persona.bautizado });
      Object.assign(persona, actualizada);
      pintarBautizado(persona);
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

  // Servidor y bautizado: los botones para cambiarlos viven ahora dentro
  // de "Editar" (pedido del usuario, 2026-08-24) — antes eran dos tarjetas
  // con botón sueltas debajo de la ficha, siempre a la vista. En modo
  // lectura quedan como una línea más de Datos, para no perder el dato de
  // vista. Conservan los ids servicio-slot/bautizado-slot en los dos modos
  // porque las tarjetas del Panel enlazan acá con ?resaltar=.
  function resumenServicioBautizadoHtml() {
    const servidor = persona.servidor
      ? `Sí${persona.fecha_inicio_servicio ? `, desde ${persona.fecha_inicio_servicio}` : ""}`
      : persona.fecha_inicio_servicio
        ? `No (fue servidor desde ${persona.fecha_inicio_servicio})`
        : "No";
    return `
      <div class="hint" id="servicio-slot"><strong>Servidor:</strong> ${servidor}</div>
      <div class="hint" id="bautizado-slot"><strong>Bautizado:</strong> ${persona.bautizado ? "Sí" : "No"}</div>
    `;
  }

  function pintarFicha() {
    const camposHtml = CAMPOS_EDITABLES_FICHA.map(([campo, etiqueta, tipo]) => {
      const valor = persona[campo] ?? "";
      if (!editando) {
        return `<div class="hint" id="campo-${campo}"><strong>${etiqueta}:</strong> ${valorFichaHtml(campo, valor)}</div>`;
      }
      return campoInput(campo, etiqueta, tipo, valor);
    }).join("");

    $form.innerHTML =
      camposHtml +
      areasHtml() +
      (editando
        ? `<div id="servicio-slot"></div><div id="bautizado-slot"></div>
           <button class="primary" type="submit" id="btn-guardar-ficha" hidden>Guardar</button>`
        : resumenServicioBautizadoHtml());
    $btnEditar.hidden = editando;

    if (editando) {
      // Se guardan solos al tocarlos (cada uno es su propio PATCH), así que
      // no dependen del botón Guardar del formulario.
      pintarServicio(persona);
      pintarBautizado(persona);
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

// --- Pendientes por revisar: servidor/bautizado se reiniciaron a False
// para las 120 personas reales (pedido del usuario, 2026-08-13) — esto
// ayuda al liderazgo a ir tachando la lista en vez de acordarse solo
// (pedido del usuario, 2026-08-14). "Ya revisada" se detecta por la
// Bitácora (¿alguien tocó servidor o bautizado desde la ficha?), no por
// un campo nuevo. ---
Router.on("/personas/pendientes-revision", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    ${botonAtras("/personas", "Jóvenes")}
    <h1>Pendientes por revisar</h1>
    <p class="hint">Servidor y Bautizado se reiniciaron para reconfirmarlos uno por uno — acá están los que todavía nadie tocó desde su ficha. Tocá un nombre para revisarlo.</p>
    <div id="lista-pendientes" class="hint">Cargando...</div>
  `;
  try {
    const personas = await Api.pendientesRevision();
    const cont = document.getElementById("lista-pendientes");
    if (!personas.length) {
      cont.innerHTML = `<p class="hint">¡Listo! No queda nadie por revisar.</p>`;
      return;
    }
    cont.innerHTML =
      `<p class="hint"><strong>${personas.length}</strong> por revisar.</p>` +
      personas
        .map(
          (p) => `
      <a class="card-link" href="#/personas/ver?id=${p.id}">
      <div class="card">
        <strong>${p.nombre_completo}</strong>
        <div class="hint">${p.id_unico}</div>
      </div>
      </a>
    `
        )
        .join("");
  } catch (e) {
    $app.innerHTML += `<div class="error">${e.message}</div>`;
  }
});

// --- Posibles duplicados (pedido del usuario, 2026-08-24) ---
// En la lista de fichas incompletas aparecía "José Pacheco" cinco veces, y
// eran cinco registros distintos. Acá se agrupan y se pueden juntar, pero
// nunca solo: dos jóvenes pueden llamarse igual de verdad (hermanos, padre
// e hijo), y confundirlos borraría el historial de una persona real.
Router.on("/personas/duplicados", async () => {
  if (!requiereSesion()) return;
  if (!tieneAccesoPastoral()) {
    $app.innerHTML = `<p class="error">Esta sección es solo para líderes y encargados.</p>`;
    return;
  }
  const miToken = Router.token();
  $app.innerHTML = `
    ${botonAtras("/personas", "Jóvenes")}
    <h1>Posibles duplicados</h1>
    <p class="hint">
      Fichas que podrían ser la misma persona, agrupadas por teléfono igual o nombre casi idéntico. Es una
      sospecha, no una conclusión: dos jóvenes pueden llamarse igual de verdad. Revisá cada grupo y decidí vos.
    </p>
    <div id="dup-cuerpo"><p class="hint">Buscando...</p></div>
  `;

  async function cargar() {
    const cont = document.getElementById("dup-cuerpo");
    try {
      const grupos = await Api.duplicados();
      if (!Router.vigente(miToken)) return;
      if (!grupos.length) {
        cont.innerHTML = `<p class="hint">No se encontró ninguna ficha repetida. 🎉</p>`;
        return;
      }
      cont.innerHTML = grupos
        .map(
          (g, i) => `
        <div class="card grupo-dup" data-grupo="${i}">
          <p class="alertas-explica" style="margin-top:0">
            ${g.personas.length} fichas — <strong>${g.motivos.join(" · ")}</strong>
          </p>
          <ul class="lista-alertas">
            ${g.personas
              .map(
                (p) => `
              <li>
                <label class="check-label" style="margin:0;flex:1;min-width:0">
                  <input type="radio" name="conservar-${i}" value="${p.id}" ${p.id === g.sugerencia_conservar_id ? "checked" : ""}>
                  <span class="alerta-cuerpo">
                    <a class="alerta-nombre" href="#/personas/ver?id=${p.id}">${p.nombre_completo}</a>
                    <span class="alerta-meta">${p.id_unico} · ${p.historial.asistencias} asistencia${p.historial.asistencias === 1 ? "" : "s"} · ${p.historial.seguimientos} seguimiento${p.historial.seguimientos === 1 ? "" : "s"} · ficha ${p.ficha_completa_pct}%${p.telefono ? ` · ${p.telefono}` : ""}</span>
                  </span>
                </label>
              </li>`
              )
              .join("")}
          </ul>
          <p class="hint">Elegí cuál ficha conservar (viene marcada la que más historial tiene). Las demás se archivan y su historial se mueve a la elegida.</p>
          <button class="primary" type="button" data-fusionar="${i}">Juntar en la elegida</button>
          <div class="error" data-error="${i}"></div>
        </div>`
        )
        .join("");

      cont.querySelectorAll("[data-fusionar]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const i = btn.dataset.fusionar;
          const grupo = grupos[Number(i)];
          const errorBox = cont.querySelector(`[data-error="${i}"]`);
          errorBox.textContent = "";
          const elegido = cont.querySelector(`input[name="conservar-${i}"]:checked`);
          if (!elegido) {
            errorBox.textContent = "Elegí cuál conservar.";
            return;
          }
          const conservarId = Number(elegido.value);
          const otras = grupo.personas.filter((p) => p.id !== conservarId);
          const nombreElegida = grupo.personas.find((p) => p.id === conservarId).nombre_completo;
          if (
            !confirm(
              `Se va a conservar "${nombreElegida}" y archivar ${otras.length} ficha${otras.length === 1 ? "" : "s"}:\n\n` +
                otras.map((p) => `• ${p.nombre_completo} (${p.id_unico})`).join("\n") +
                `\n\nSu asistencia y seguimiento se mueven a la que queda. No se borra nada: las archivadas quedan guardadas.\n\n¿Continuar?`
            )
          )
            return;
          btn.disabled = true;
          btn.textContent = "Juntando...";
          try {
            for (const otra of otras) {
              await Api.fusionarDuplicados(conservarId, otra.id);
            }
            await cargar();
          } catch (e) {
            btn.disabled = false;
            btn.textContent = "Juntar en la elegida";
            errorBox.textContent = e.message || "No se pudo juntar.";
          }
        });
      });
    } catch (e) {
      if (!Router.vigente(miToken)) return;
      cont.innerHTML = `<div class="error">${e.message}</div>`;
    }
  }

  await cargar();
});

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

