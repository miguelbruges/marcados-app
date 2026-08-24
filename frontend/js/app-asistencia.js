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
    <h2 style="margin-top:1.6rem">Ver asistencia por día</h2>
    <div id="asis-calendario-slot"></div>
  `;
  wireOtroManual("asis-actividad", "asis-otro-slot");
  document.getElementById("asis-iniciar").addEventListener("click", iniciarRegistroAsistencia);
  document.getElementById("asis-calendario-slot").appendChild(crearCalendarioAsistencia(actividades));
});

// --- Calendario pequeño y permanente: elegir un día y ver quién asistió
// (pedido del usuario, 2026-08-23) — separado del flujo de registro (que
// sigue siendo "hoy hacia adelante"); esto es para consultar el historial. ---
function crearCalendarioAsistencia(actividades) {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  // Dos letras, no una: con "L M M J V S D" el navegador leía cada "M"
  // suelta como una abreviatura y la expandía a "METRO" en pantalla
  // (bug real reportado por el usuario, 2026-08-24). Además "Ma"/"Mi"
  // distingue martes de miércoles, que con una sola letra era imposible.
  const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  const pad = (n) => String(n).padStart(2, "0");
  const fechaLocal = (anio, mesIdx, dia) => `${anio}-${pad(mesIdx + 1)}-${pad(dia)}`;

  const cont = document.createElement("div");
  cont.className = "card calendario-asistencia";
  const hoy = new Date();
  const fechaHoy = fechaLocal(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let anioActual = hoy.getFullYear();
  let mesActual = hoy.getMonth();
  let diaSeleccionado = fechaHoy;
  let tokenVigente = null;

  async function render() {
    const miToken = (tokenVigente = {});
    cont.innerHTML = `<p class="hint">Cargando calendario...</p>`;
    const ultimoDia = new Date(anioActual, mesActual + 1, 0).getDate();
    const desde = fechaLocal(anioActual, mesActual, 1);
    const hasta = fechaLocal(anioActual, mesActual, ultimoDia);

    let eventosMes = [];
    try {
      eventosMes = await Api.eventosPorRango(desde, hasta);
    } catch (e) {
      if (tokenVigente !== miToken) return;
      cont.innerHTML = `<div class="error">${e.message}</div>`;
      return;
    }
    if (tokenVigente !== miToken) return;
    const fechasConEventos = new Set(eventosMes.map((ev) => ev.fecha));

    const primerDiaSemana = (new Date(anioActual, mesActual, 1).getDay() + 6) % 7; // 0 = lunes
    const celdas = Array(primerDiaSemana).fill(null);
    for (let d = 1; d <= ultimoDia; d++) celdas.push(d);

    cont.innerHTML = `
      <div class="calendario-cuerpo" translate="no">
        <div class="calendario-header">
          <button type="button" class="tap-btn" id="cal-prev" aria-label="Mes anterior">‹</button>
          <strong>${MESES[mesActual]} ${anioActual}</strong>
          <button type="button" class="tap-btn" id="cal-next" aria-label="Mes siguiente">›</button>
        </div>
        <div class="calendario-dias-semana">${DIAS_SEMANA.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="calendario-grilla">
          ${celdas
            .map((d) => {
              if (!d) return `<span class="calendario-celda vacia"></span>`;
              const fecha = fechaLocal(anioActual, mesActual, d);
              const clases = [
                "calendario-celda",
                fechasConEventos.has(fecha) ? "con-evento" : "",
                fecha === diaSeleccionado ? "seleccionada" : "",
                fecha === fechaHoy ? "hoy" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return `<button type="button" class="${clases}" data-fecha="${fecha}">${d}</button>`;
            })
            .join("")}
        </div>
      </div>
      <div id="calendario-detalle"></div>
    `;

    document.getElementById("cal-prev").addEventListener("click", () => {
      mesActual--;
      if (mesActual < 0) {
        mesActual = 11;
        anioActual--;
      }
      render();
    });
    document.getElementById("cal-next").addEventListener("click", () => {
      mesActual++;
      if (mesActual > 11) {
        mesActual = 0;
        anioActual++;
      }
      render();
    });
    cont.querySelectorAll(".calendario-celda[data-fecha]").forEach((btn) => {
      btn.addEventListener("click", () => {
        diaSeleccionado = btn.dataset.fecha;
        cont.querySelectorAll(".calendario-celda").forEach((b) => b.classList.remove("seleccionada"));
        btn.classList.add("seleccionada");
        mostrarDetalleDia(diaSeleccionado);
      });
    });

    mostrarDetalleDia(diaSeleccionado);
  }

  // Un evento del día, con su lista editable: cada asistente se puede
  // quitar y se puede agregar a alguien más ahí mismo — antes esto era
  // solo de lectura y para corregir un día pasado había que volver al
  // flujo de registro (pedido del usuario, 2026-08-24).
  function bloqueEvento(ev, asistentes) {
    const card = document.createElement("div");
    card.className = "card";
    const yaEstan = new Set(asistentes.map((a) => a.persona_id));

    card.innerHTML = `
      <strong>${ev.nombre}</strong>
      <span class="hint"><span class="cuenta-asistentes">${asistentes.length}</span> asistente${asistentes.length === 1 ? "" : "s"}</span>
      <ul class="lista-asistieron lista-dia"></ul>
      <div class="agregar-al-dia"></div>
    `;
    const ul = card.querySelector(".lista-dia");
    const cuenta = card.querySelector(".cuenta-asistentes");

    function refrescarCuenta() {
      const n = ul.querySelectorAll("li[data-asistencia-id]").length;
      cuenta.textContent = n;
      const vacio = ul.querySelector(".sin-nadie");
      if (n === 0 && !vacio) {
        ul.insertAdjacentHTML("beforeend", `<li class="hint sin-nadie">Nadie registrado.</li>`);
      } else if (n > 0 && vacio) {
        vacio.remove();
      }
    }

    function filaDelDia(registro) {
      const li = document.createElement("li");
      li.dataset.asistenciaId = registro.id;
      li.innerHTML = `<span>${registro.persona_nombre}</span> <button type="button" class="quitar-asis" aria-label="Quitar a ${registro.persona_nombre}">✕</button>`;
      li.querySelector(".quitar-asis").addEventListener("click", async () => {
        if (!confirm(`¿Quitar a ${registro.persona_nombre} de "${ev.nombre}"?`)) return;
        try {
          await Api.quitarAsistencia(registro.id);
          yaEstan.delete(registro.persona_id);
          li.remove();
          refrescarCuenta();
        } catch (e) {
          alert(`No se pudo quitar: ${e.message}`);
        }
      });
      return li;
    }

    for (const a of asistentes) ul.appendChild(filaDelDia(a));
    refrescarCuenta();

    const buscador = crearBuscadorPersonas({
      placeholder: "Agregar joven a este día...",
      onSeleccionar: async (candidato) => {
        if (yaEstan.has(candidato.persona_id)) {
          alert(`${candidato.nombre_completo} ya está registrado en "${ev.nombre}".`);
          return;
        }
        try {
          const registro = await Api.registrarAsistencia({
            persona_id: candidato.persona_id,
            evento_id: ev.id,
            presente: true,
          });
          yaEstan.add(candidato.persona_id);
          ul.appendChild(filaDelDia(registro));
          refrescarCuenta();
        } catch (e) {
          alert(`No se pudo agregar: ${e.message}`);
        }
      },
    });
    card.querySelector(".agregar-al-dia").appendChild(buscador);
    return card;
  }

  // Para un día sin nada cargado (o para sumar otra actividad al mismo
  // día): crea el evento y vuelve a dibujar, así aparece su punto en el
  // calendario y su lista editable.
  function bloqueNuevaActividad(fecha, yaHayEventos) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <p class="hint" style="margin-top:0">${yaHayEventos ? "¿Hubo otra actividad ese día?" : `No hay nada cargado el ${fecha}. Podés crear el registro acá:`}</p>
      <select class="sel-actividad-dia">${opcionesActividades(actividades)}</select>
      <button class="primary" type="button">Crear registro para este día</button>
      <div class="error err-nueva-actividad"></div>
    `;
    card.querySelector("button").addEventListener("click", async () => {
      const select = card.querySelector(".sel-actividad-dia");
      const actividadId = Number(select.value);
      const nombre = select.options[select.selectedIndex].textContent;
      const err = card.querySelector(".err-nueva-actividad");
      err.textContent = "";
      try {
        await Api.crearOReusarEvento({ actividad_id: actividadId, nombre: `${nombre} ${fecha}`, fecha });
        await render();
      } catch (e) {
        err.textContent = e.message || "No se pudo crear el registro.";
      }
    });
    return card;
  }

  async function mostrarDetalleDia(fecha) {
    const detalle = document.getElementById("calendario-detalle");
    if (!detalle) return;
    detalle.innerHTML = `<p class="hint">Cargando asistencia del ${fecha}...</p>`;
    try {
      const eventosDia = await Api.eventosPorRango(fecha, fecha);
      const asistentesPorEvento = await Promise.all(eventosDia.map((ev) => Api.verAsistenciaEvento(ev.id)));
      detalle.innerHTML = "";
      eventosDia.forEach((ev, i) => detalle.appendChild(bloqueEvento(ev, asistentesPorEvento[i])));
      detalle.appendChild(bloqueNuevaActividad(fecha, eventosDia.length > 0));
    } catch (e) {
      detalle.innerHTML = `<div class="error">${e.message}</div>`;
    }
  }

  render();
  return cont;
}

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
    const ignorados = [];
    // Antes esto solo miraba qué radios quedaron tildados en "sí" — a una
    // línea "Pendiente por confirmar" que nadie tocó le queda tildado por
    // defecto "Ignorar esta línea", y se guardaba así sin avisar: de una
    // lista de 30+ nombres pegada, solo las de ALTA confianza (matcheo
    // automático) quedaban guardadas, y el resto desaparecía en silencio —
    // "se tomó asistencia pero no se refleja" (pedido del usuario, 2026-08-23).
    // Ahora se cuentan explícitamente y se avisa antes de guardar.
    preview.filas.forEach((fila, idx) => {
      const marcado = document.querySelector(`#imp-resultado input[name="fila-${idx}"]:checked`);
      const valor = marcado ? marcado.value : "";
      if (valor) {
        seleccionados.add(Number(valor));
      } else {
        ignorados.push(fila.texto_original);
      }
    });
    const $out = document.getElementById("imp-guardar-resultado");
    if (!seleccionados.size) {
      $out.innerHTML = `<p class="hint">No hay nadie seleccionado para guardar.</p>`;
      return;
    }
    if (ignorados.length) {
      const lista = ignorados.map((t) => `• ${t}`).join("\n");
      const continuar = confirm(
        `Se van a guardar ${seleccionados.size} y se van a IGNORAR ${ignorados.length} línea${ignorados.length === 1 ? "" : "s"} sin confirmar (no van a quedar registradas):\n\n${lista}\n\n¿Continuar de todos modos?`
      );
      if (!continuar) return;
    }
    try {
      const r = await Api.confirmarImportarLista({
        evento_id: preview.evento.id,
        persona_ids: [...seleccionados],
      });
      const avisoIgnorados = ignorados.length
        ? ` · Ignorados sin confirmar: ${ignorados.length} (${ignorados.join(", ")})`
        : "";
      $out.innerHTML = `<div class="card">Guardados: ${r.guardados} · Ya estaban registrados: ${r.ya_registrados}${avisoIgnorados}</div>`;
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

