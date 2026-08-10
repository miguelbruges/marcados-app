const $app = document.getElementById("app");
const $tabbar = document.getElementById("tabbar");
const $btnSalir = document.getElementById("btn-salir");

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
  Router.navegar("/login");
});

// --- Login ---
Router.on("/login", () => {
  $tabbar.hidden = true;
  $btnSalir.hidden = true;
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
      <p class="hint" id="login-toggle-ver">
        <label><input type="checkbox" id="login-ver-clave"> Mostrar contraseña</label>
      </p>
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
  const linkUsuarios = esAdmin ? `<p><a href="#/usuarios">+ Gestionar usuarios (líderes)</a></p>` : "";
  const linkExportar = esAdmin
    ? `<p><a href="#" id="btn-exportar-excel">Descargar Excel (plantilla real)</a></p>
       <p><a href="#/admin/migracion">Cargar Excel real (carga inicial)</a></p>`
    : "";
  $app.innerHTML = `<h1>Hola, ${Api.nombre()}</h1>${linkUsuarios}${linkExportar}<div id="stats" class="stat-grid"></div>`;
  try {
    const r = await Api.dashboardResumen();
    document.getElementById("stats").innerHTML = `
      ${stat(r.total_jovenes, "Total jóvenes")}
      ${stat(r.activos, "Activos")}
      ${stat(r.bautizados, "Bautizados")}
      ${stat(r.sirviendo, "Sirviendo")}
      ${stat(r.asistieron_ultimos_30_dias, "Asistieron (30 días)")}
    `;
  } catch (e) {
    $app.innerHTML += `<div class="error">${e.message}</div>`;
  }

  if (tieneAccesoPastoral()) {
    try {
      const a = await Api.alertasResumen();
      $app.innerHTML += `
        <h2>Semáforo de asistencia (últimos 30 días)</h2>
        <p class="hint">Alerta operativa, no una conclusión pastoral — la decisión siempre la toma una persona.</p>
        <div class="stat-grid">
          ${stat(a.verde, "Verde")}
          ${stat(a.amarillo, "Amarillo")}
          ${stat(a.rojo, "Rojo")}
          ${stat(a.sin_datos, "Sin datos")}
        </div>
      `;
    } catch (e) {
      $app.innerHTML += `<div class="error">${e.message}</div>`;
    }
  }

  if (esAdmin) {
    document.getElementById("btn-exportar-excel").addEventListener("click", async (e) => {
      e.preventDefault();
      const link = e.target;
      const textoOriginal = link.textContent;
      link.textContent = "Generando...";
      try {
        const blob = await Api.descargarExcel();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "MARCADOS_export.xlsx";
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(err.message || "No se pudo generar el Excel.");
      } finally {
        link.textContent = textoOriginal;
      }
    });
  }
});

function stat(num, label) {
  return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

// --- Carga inicial: subir el Excel real (solo admin) ---
Router.on("/admin/migracion", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    <h1>Cargar Excel real</h1>
    <p class="hint">Para la carga inicial de los jóvenes reales. Primero se muestra una vista previa (no guarda nada) — recién con "Confirmar" se escribe en la base. Se niega a correr si ya hay personas cargadas.</p>
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
Router.on("/personas", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    <h1>Jóvenes registrados</h1>
    <p>
      <a href="#/servidores/nuevo">+ Marcar nuevo servidor (reunión STAFF)</a><br>
      <a href="#/personas/incompletas">Ver fichas incompletas</a><br>
      <a href="#/invitaciones">Ranking de invitaciones</a>
    </p>
    <div id="lista-personas" class="hint">Cargando...</div>
  `;
  try {
    const personas = await Api.personas();
    const cont = document.getElementById("lista-personas");
    if (!personas.length) {
      cont.innerHTML = `<p class="hint">Todavía no hay jóvenes registrados.</p>`;
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
    const [persona, alertas, seguimientos, catalogos] = await Promise.all([
      Api.persona(id),
      accesoPastoral ? Api.alertasPersona(id) : Promise.resolve(null),
      accesoPastoral ? Api.historialSeguimiento(id) : Promise.resolve(null),
      cargarCatalogosFicha(),
    ]);
    renderFicha(persona, alertas, seguimientos, catalogos);
  } catch (e) {
    $app.innerHTML = `<div class="error">${e.message}</div>`;
  }
});

function renderFicha(persona, alertas, seguimientos, catalogos) {
  const seccionAlertas = alertas
    ? `
    <div class="stat-grid">
      ${stat(persona.ficha_completa_pct + "%", "Ficha completa")}
      ${stat(nivelAsistenciaEtiqueta(alertas.nivel_asistencia), "Asistencia (30d)")}
      ${stat(alertas.inasistencias_consecutivas, "Inasistencias seguidas")}
    </div>`
    : `<div class="stat-grid">${stat(persona.ficha_completa_pct + "%", "Ficha completa")}</div>`;

  const seccionSeguimiento = seguimientos
    ? `
    <h2>Seguimiento pastoral</h2>
    <div id="lista-seguimiento"></div>
    <form id="form-seguimiento">
      <label>Tipo</label>
      <input type="text" id="seg-tipo" placeholder="llamada, visita, mensaje...">
      <label>Notas</label>
      <textarea id="seg-notas" required></textarea>
      <label><input type="checkbox" id="seg-requiere-atencion"> Requiere atención</label>
      <button class="primary" type="submit">Agregar registro</button>
      <div class="error" id="seguimiento-error"></div>
    </form>`
    : "";

  $app.innerHTML = `
    <p><a href="#/personas">&larr; Volver a jóvenes</a></p>
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

  function pintarFicha() {
    $form.innerHTML = CAMPOS_EDITABLES_FICHA.map(([campo, etiqueta, tipo]) => {
      const valor = persona[campo] ?? "";
      if (!editando) {
        return `<div class="hint"><strong>${etiqueta}:</strong> ${valor || "—"}</div>`;
      }
      return campoInput(campo, etiqueta, tipo, valor);
    }).join("");
    if (editando) {
      $form.innerHTML += `<button class="primary" type="submit">Guardar</button>`;
    }
    $btnEditar.hidden = editando;
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
    try {
      const actualizada = await Api.editarPersona(persona.id, cambios);
      Object.assign(persona, actualizada);
      editando = false;
      pintarFicha();
    } catch (err) {
      errorBox.textContent = err.message || "No se pudo guardar.";
    }
  });

  if (seguimientos) {
    const $listaSeg = document.getElementById("lista-seguimiento");
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
    }
    pintarSeguimientos(seguimientos);

    document.getElementById("form-seguimiento").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById("seguimiento-error");
      errorBox.textContent = "";
      try {
        await Api.crearSeguimiento({
          persona_id: persona.id,
          tipo: document.getElementById("seg-tipo").value || null,
          notas: document.getElementById("seg-notas").value,
          requiere_atencion: document.getElementById("seg-requiere-atencion").checked,
        });
        const nuevos = await Api.historialSeguimiento(persona.id);
        pintarSeguimientos(nuevos);
        e.target.reset();
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

// --- Registrar asistencia ---
Router.on("/asistencia", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    <h1>Registrar asistencia</h1>
    <label>Actividad</label>
    <select id="asis-actividad">
      <option value="1">Culto Juvenil</option>
    </select>
    <label>Fecha</label>
    <input type="date" id="asis-fecha" value="${new Date().toISOString().slice(0, 10)}">
    <button class="primary" id="asis-iniciar">Iniciar registro</button>
    <div id="asis-body"></div>
  `;
  document.getElementById("asis-iniciar").addEventListener("click", iniciarRegistroAsistencia);
});

async function iniciarRegistroAsistencia() {
  const actividadId = Number(document.getElementById("asis-actividad").value);
  const fecha = document.getElementById("asis-fecha").value;
  const body = document.getElementById("asis-body");
  body.innerHTML = `<p class="hint">Cargando...</p>`;

  let evento;
  try {
    evento = await Api.crearOReusarEvento({
      actividad_id: actividadId,
      nombre: `Culto Juvenil ${fecha}`,
      fecha,
    });
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
  `;

  async function refrescarLista() {
    const registros = await Api.verAsistenciaEvento(evento.id);
    document.getElementById("conteo-asistieron").textContent = registros.length;
    const ul = document.getElementById("lista-asistieron");
    ul.innerHTML = registros.length
      ? ""
      : `<li class="hint">Nadie registrado todavía.</li>`;
    for (const r of registros) marcados.add(r.persona_id);
  }

  const buscador = crearBuscadorPersonas({
    placeholder: "Nombre del joven...",
    onSeleccionar: async (candidato) => {
      if (marcados.has(candidato.persona_id)) {
        alert(`${candidato.nombre_completo} ya está registrado en este evento.`);
        return;
      }
      try {
        await Api.registrarAsistencia({ persona_id: candidato.persona_id, evento_id: evento.id, presente: true });
        marcados.add(candidato.persona_id);
        const ul = document.getElementById("lista-asistieron");
        const placeholder = ul.querySelector(".hint");
        if (placeholder) placeholder.remove();
        const li = document.createElement("li");
        li.textContent = `✓ ${candidato.nombre_completo}`;
        ul.prepend(li);
        document.getElementById("conteo-asistieron").textContent =
          Number(document.getElementById("conteo-asistieron").textContent) + 1;
      } catch (e) {
        alert(`No se pudo registrar: ${e.message}`);
      }
    },
  });
  document.getElementById("buscador-slot").appendChild(buscador);

  await refrescarLista();
}

// --- Importar lista pegada (WhatsApp) ---
Router.on("/asistencia/importar", () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    <h1>Importar lista de asistencia</h1>
    <p class="hint">Pega el mensaje tal cual llega por WhatsApp. La primera línea con la palabra "asistencia" se ignora automáticamente.</p>
    <label>Actividad</label>
    <select id="imp-actividad">
      <option value="1">Culto Juvenil</option>
    </select>
    <label>Fecha</label>
    <input type="date" id="imp-fecha" value="${new Date().toISOString().slice(0, 10)}">
    <label>Lista pegada</label>
    <textarea id="imp-texto" rows="8" placeholder="asistencia culto juvenil 25/07/2026&#10;Sofia Hernandez&#10;Camila Rodriguez&#10;..."></textarea>
    <button class="primary" id="imp-procesar">Procesar</button>
    <div id="imp-resultado"></div>
  `;
  document.getElementById("imp-procesar").addEventListener("click", procesarListaImportada);
});

async function procesarListaImportada() {
  const actividad_id = Number(document.getElementById("imp-actividad").value);
  const fecha = document.getElementById("imp-fecha").value;
  const texto = document.getElementById("imp-texto").value;
  const resultado = document.getElementById("imp-resultado");
  resultado.innerHTML = `<p class="hint">Procesando...</p>`;

  let preview;
  try {
    preview = await Api.previewImportarLista({ actividad_id, fecha, texto });
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
