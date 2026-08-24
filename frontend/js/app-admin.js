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
        <span class="fila-admin-texto"><strong>Excel</strong><small>Descargar o importar el archivo real</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
      <a class="fila-admin" href="#/admin/ver-como">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/></svg></span>
        <span class="fila-admin-texto"><strong>Ver la app como…</strong><small>Mirar la pantalla tal cual la ve un líder, un encargado o consolidación</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
    </div>
  `;
});

// --- Ver la app como otro rol (pedido del usuario, 2026-08-24) ---
// Cambia SOLO lo que la interfaz muestra: el token sigue siendo el del
// admin, así que no es una prueba de los permisos del backend — es para
// ver cómo le queda la pantalla a cada rol. Se puede confiar en que no
// abre nada de más justamente porque solo puede esconder interfaz.
Router.on("/admin/ver-como", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  const QUE_VE = {
    lider: "Todo lo pastoral (semáforo, seguimiento, alertas) pero nada de Administración. Hoy ve exactamente lo mismo que un encargado.",
    encargado: "Todo lo pastoral (semáforo, seguimiento, alertas) pero nada de Administración.",
    consolidacion: "Panel, jóvenes, fichas y asistencia. NO ve el semáforo, el seguimiento pastoral ni la campanita de alertas.",
  };
  $app.innerHTML = `
    ${botonAtras("/admin", "Administración")}
    <h1>Ver la app como…</h1>
    <p class="hint">
      Para revisar cómo le queda la pantalla a cada rol sin tener que entrar con otra cuenta. Mientras dure,
      una franja naranja arriba te lo recuerda y te deja volver a tu vista cuando quieras.
    </p>
    <p class="aclaracion">
      Ojo: esto cambia lo que <strong>se muestra</strong>, no tus permisos. Tu sesión sigue siendo de admin,
      así que no sirve para comprobar que el servidor bloquee lo que tiene que bloquear — eso ya lo hace el
      backend por su cuenta, aparte de la interfaz.
    </p>
    <div class="lista-admin">
      ${Api.rolesQueSePuedenVer()
        .map(
          (rol) => `
        <a class="fila-admin" href="#" data-ver-rol="${rol}">
          <span class="fila-admin-texto"><strong>${NOMBRE_ROL[rol]}</strong><small>${QUE_VE[rol]}</small></span>
          <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
        </a>
      `
        )
        .join("")}
    </div>
    <div class="error" id="ver-como-error"></div>
  `;

  $app.querySelectorAll("[data-ver-rol]").forEach((fila) => {
    fila.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        Api.verComoRol(fila.dataset.verRol);
      } catch (err) {
        document.getElementById("ver-como-error").textContent = err.message;
        return;
      }
      // Recarga completa: cada pantalla decide al dibujarse qué pedir y qué
      // mostrar según el rol, así que la vista prestada tiene que arrancar
      // de cero para ser fiel.
      location.hash = "#/panel";
      location.reload();
    });
  });
});

// --- Excel: exportar e importar (pedido del usuario, 2026-08-16): antes eran
// 4 filas ("Descargar", "Actualizar desde Excel", "Cargar datos iniciales",
// "Subir plantilla") — ahora quedan solo exportación e importación; la
// plantilla se sube una sola vez y pasa a ser un link chico en la esquina. ---
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
      <a class="fila-admin" href="#/admin/importar-excel">
        <span class="fila-admin-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.2M20 12a8 8 0 0 1-14 5.2"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></span>
        <span class="fila-admin-texto"><strong>Importar Excel</strong><small>Editaste el Excel por fuera de la app — subilo y sincroniza: crea a quien no existe y actualiza a quien cambió</small></span>
        <span class="fila-admin-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
      </a>
    </div>
    <div class="error" id="admin-error"></div>
    <p class="hint" style="text-align:right;margin-top:1.5rem"><a href="#/admin/plantilla" id="link-plantilla">Plantilla: consultando...</a></p>
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
      const link = document.getElementById("link-plantilla");
      if (sub) {
        sub.textContent = estado.configurada
          ? "Exporta con el diseño del libro real"
          : "Hace falta subir la plantilla primero (abajo)";
      }
      if (link) {
        link.textContent = estado.configurada ? "Plantilla: cambiar" : "Plantilla: subir (hace falta para exportar)";
      }
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

// --- Importar Excel: un solo flujo (pedido del usuario, 2026-08-16) — antes
// eran dos pantallas separadas ("Cargar datos iniciales", que se negaba si ya
// había personas, y "Actualizar desde Excel", que nunca creaba). Por ID
// único: crea a quien no existe todavía y actualiza campo por campo a quien
// ya existe y cambió, en la misma subida. ---
Router.on("/admin/importar-excel", () => {
  if (!requiereSesion()) return;
  if (Api.rol() !== "admin") {
    $app.innerHTML = `<p class="error">Esta sección es solo para administradores.</p>`;
    return;
  }
  $app.innerHTML = `
    ${botonAtras("/admin/excel", "Excel")}
    <h1>Importar Excel</h1>
    <p class="hint">
      Cuando el Excel se edita por fuera de la app y hay que traer esos cambios acá: subilo. Por ID único
      (columna A) crea a quien todavía no existe y actualiza a quien ya existe y cambió — nunca borra a nadie.
      Primero se muestra una vista previa (no guarda nada); recién con "Confirmar" se escribe.
    </p>
    <label>Archivo (.xlsx)</label>
    <input type="file" id="importar-archivo" accept=".xlsx,.xlsm">
    <button class="primary" id="btn-importar-vista-previa" type="button">Ver vista previa</button>
    <div id="importar-reporte"></div>
    <button class="primary" id="btn-importar-confirmar" type="button" hidden>Confirmar importación</button>
    <div class="error" id="importar-error"></div>
  `;

  function archivoElegido() {
    const input = document.getElementById("importar-archivo");
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
    tiene_instagram: "Tiene Instagram",
    instagram: "Instagram",
    tiene_facebook: "Tiene Facebook",
    facebook: "Facebook",
    direccion: "Dirección",
    contacto_emergencia: "Contacto de emergencia",
    parentesco: "Parentesco",
    telefono_emergencia: "Teléfono de emergencia",
    grupo_sanguineo: "Grupo sanguíneo",
    eps: "EPS",
    talla: "Talla",
    como_llego: "Cómo llegó",
    fecha_ingreso: "Fecha de ingreso",
    fecha_bautismo: "Fecha de bautismo",
    fecha_inicio_servicio: "Fecha de inicio de servicio",
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
    const cont = document.getElementById("importar-reporte");
    const btnConfirmar = document.getElementById("btn-importar-confirmar");
    if (reporte.error) {
      cont.innerHTML = `<div class="error">${reporte.error}</div>`;
      btnConfirmar.hidden = true;
      return;
    }

    const aCrear = reporte.a_crear || [];
    const aActualizar = reporte.a_actualizar || [];
    const sinMencionar = reporte.personas_sin_mencionar || [];
    const catalogos = Object.entries(reporte.catalogos || {})
      .map(([tipo, n]) => `${tipo}: ${n}`)
      .join(", ");

    const listaCrear = aCrear.length
      ? `<ul class="kpi-lista">${aCrear.map((f) => `<li>${f.nombre_completo || "sin nombre"} <span class="hint">${f.id_unico}</span></li>`).join("")}</ul>`
      : `<p class="hint">Nadie nuevo para crear.</p>`;

    const listaActualizar = aActualizar.length
      ? aActualizar
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
      <h2>Nuevas personas a crear (${aCrear.length})</h2>
      ${listaCrear}
      <h2>Cambios detectados (${aActualizar.length})</h2>
      ${listaActualizar}
      <p class="hint"><strong>Catálogos:</strong> ${catalogos}</p>
      ${
        sinMencionar.length
          ? `<p class="hint">${sinMencionar.length} persona${sinMencionar.length === 1 ? "" : "s"} de la base no aparece${sinMencionar.length === 1 ? "" : "n"} en este Excel — no se les toca nada.</p>`
          : ""
      }
      ${
        reporte.resultado
          ? `<div class="card"><strong>${reporte.mensaje}</strong> Creadas: ${reporte.resultado.personas_creadas}, actualizadas: ${reporte.resultado.personas_actualizadas} (${reporte.resultado.campos_actualizados} campos), catálogos: ${reporte.resultado.catalogos_creados}, seguimientos de revisión: ${reporte.resultado.seguimientos_creados}.</div>`
          : `<p class="hint">${reporte.mensaje || ""}</p>`
      }
    `;
    btnConfirmar.hidden = (!aCrear.length && !aActualizar.length) || !!reporte.resultado;
  }

  document.getElementById("btn-importar-vista-previa").addEventListener("click", async () => {
    const archivo = archivoElegido();
    const errorBox = document.getElementById("importar-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    try {
      const reporte = await Api.importarExcel(archivo, false);
      pintarReporte(reporte);
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo leer el archivo.";
    }
  });

  document.getElementById("btn-importar-confirmar").addEventListener("click", async () => {
    const archivo = archivoElegido();
    const errorBox = document.getElementById("importar-error");
    errorBox.textContent = "";
    if (!archivo) {
      errorBox.textContent = "Elegí un archivo primero.";
      return;
    }
    if (!confirm("¿Seguro? Esto va a crear y/o actualizar personas en la base de datos en vivo. No se puede deshacer desde acá.")) return;
    try {
      const reporte = await Api.importarExcel(archivo, true);
      pintarReporte(reporte);
    } catch (e) {
      errorBox.textContent = e.message || "No se pudo importar.";
    }
  });
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

