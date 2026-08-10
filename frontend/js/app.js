const $app = document.getElementById("app");
const $tabbar = document.getElementById("tabbar");
const $btnSalir = document.getElementById("btn-salir");

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
  const linkUsuarios = Api.rol() === "admin" ? `<p><a href="#/usuarios">+ Gestionar usuarios (líderes)</a></p>` : "";
  $app.innerHTML = `<h1>Hola, ${Api.nombre()}</h1>${linkUsuarios}<div id="stats" class="stat-grid"></div>`;
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
});

function stat(num, label) {
  return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

// --- Ver jóvenes registrados ---
Router.on("/personas", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `
    <h1>Jóvenes registrados</h1>
    <p><a href="#/servidores/nuevo">+ Marcar nuevo servidor (reunión STAFF)</a></p>
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
      <div class="card">
        <strong>${p.nombres} ${p.apellidos}</strong>
        <div class="hint">
          ${p.id_unico}${p.estado ? " · " + p.estado : ""}${p.bautizado ? " · bautizado" : ""}
          ${p.servidor ? " · servidor" + (p.fecha_inicio_servicio ? ` desde ${p.fecha_inicio_servicio}` : "") : ""}
        </div>
        <div class="hint">Ingresó: ${p.fecha_ingreso || "—"}</div>
      </div>
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
Router.on("/personas/nueva", () => {
  if (!requiereSesion()) return;
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
        <option value="Masculino">Masculino</option>
        <option value="Femenino">Femenino</option>
      </select>
      <label>¿Bautizado?</label>
      <select name="bautizado">
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
      <label>Dirección</label>
      <input type="text" name="direccion">
      <label>Notas</label>
      <textarea name="notas" rows="3"></textarea>
      <button class="primary" type="submit">Guardar</button>
      <div class="error" id="persona-error"></div>
      <div id="persona-ok"></div>
    </form>
  `;
  document.getElementById("form-persona").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    data.bautizado = data.bautizado === "true";
    for (const campo of ["fecha_nacimiento", "telefono", "genero", "direccion", "notas"]) {
      if (data[campo] === "") delete data[campo];
    }
    const errorBox = document.getElementById("persona-error");
    errorBox.textContent = "";
    try {
      const persona = await Api.crearPersona(data);
      document.getElementById("persona-ok").innerHTML =
        `<div class="card">Guardado: <strong>${persona.nombres} ${persona.apellidos}</strong> (${persona.id_unico})<br>
         <span class="hint">Fecha de ingreso registrada automáticamente: ${persona.fecha_ingreso}</span></div>`;
      form.reset();
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
