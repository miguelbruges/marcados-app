// Buscador de personas con matching difuso, reusable en cualquier pantalla
// que necesite "escribir un nombre aproximado -> elegir la persona correcta".
function crearBuscadorPersonas({ onSeleccionar, placeholder = "Buscar joven..." }) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <input type="text" class="buscador-input" placeholder="${placeholder}" autocomplete="off">
    <ul class="candidatos"></ul>
  `;
  const input = wrapper.querySelector(".buscador-input");
  const lista = wrapper.querySelector(".candidatos");

  let temporizador;
  input.addEventListener("input", () => {
    clearTimeout(temporizador);
    const q = input.value.trim();
    lista.innerHTML = "";
    if (q.length < 2) return;
    temporizador = setTimeout(async () => {
      try {
        const resultado = await Api.buscarCoincidencias(q);
        renderCandidatos(resultado);
      } catch (e) {
        lista.innerHTML = `<li class="error">${e.message}</li>`;
      }
    }, 300);
  });

  function renderCandidatos(resultado) {
    lista.innerHTML = "";
    if (!resultado.candidatos.length) {
      lista.innerHTML = `<li class="hint">Sin coincidencias. Verifica el nombre o agrégalo como joven nuevo.</li>`;
      return;
    }
    if (resultado.confianza === "BAJA") {
      const aviso = document.createElement("li");
      aviso.className = "hint";
      aviso.textContent = "Confianza baja: selecciona con cuidado o busca con más detalle.";
      lista.appendChild(aviso);
    }
    for (const c of resultado.candidatos) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${c.nombre_completo} <span class="badge ${resultado.confianza}">${Math.round(c.score)}%</span></span>
        <button class="tap-btn" type="button">Elegir</button>
      `;
      li.querySelector("button").addEventListener("click", () => {
        input.value = "";
        lista.innerHTML = "";
        onSeleccionar(c);
      });
      lista.appendChild(li);
    }
  }

  return wrapper;
}
