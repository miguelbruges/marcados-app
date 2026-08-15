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

