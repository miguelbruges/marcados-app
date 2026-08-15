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

