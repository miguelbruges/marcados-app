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
      <input type="email" id="login-email" required autocomplete="username">
      <label>Contraseña</label>
      <input type="password" id="login-password" required autocomplete="current-password">
      <button class="primary" type="submit">Entrar</button>
      <div class="error" id="login-error"></div>
    </form>
  `;
  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const errorBox = document.getElementById("login-error");
    errorBox.textContent = "";
    try {
      const { access_token, rol, nombre } = await Api.login(email, password);
      Api.setSession(access_token, rol, nombre);
      Router.navegar("/panel");
    } catch (e2) {
      errorBox.textContent = "Email o contraseña incorrectos.";
    }
  });
});

// --- Panel ---
Router.on("/panel", async () => {
  if (!requiereSesion()) return;
  $app.innerHTML = `<h1>Hola, ${Api.nombre()}</h1><div id="stats" class="stat-grid"></div>`;
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
        `<div class="card">Guardado: <strong>${persona.nombres} ${persona.apellidos}</strong> (${persona.id_unico})</div>`;
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
