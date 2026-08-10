// Cliente HTTP mínimo. Sin dependencias externas a propósito — este frontend
// no tiene paso de build, debe poder abrirse sirviendo estos archivos tal cual.
const Api = (() => {
  // En producción, FastAPI sirve este archivo desde su propio dominio
  // (mismo origen que la API — evita CORS entre sitios distintos, que
  // algunas redes móviles bloquean de formas difíciles de diagnosticar).
  // Solo en desarrollo local hace falta apuntar a otro puerto.
  const esLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const BASE_URL = window.MARCADOS_API_URL || (esLocal ? "http://localhost:8000" : "");

  function token() {
    return localStorage.getItem("marcados_token");
  }

  function setSession(token_, rol, nombre) {
    localStorage.setItem("marcados_token", token_);
    localStorage.setItem("marcados_rol", rol);
    localStorage.setItem("marcados_nombre", nombre);
  }

  function clearSession() {
    localStorage.removeItem("marcados_token");
    localStorage.removeItem("marcados_rol");
    localStorage.removeItem("marcados_nombre");
  }

  async function request(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && token()) headers["Authorization"] = `Bearer ${token()}`;

    const resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 401 && auth) {
      // Solo tratamos el 401 como "sesión vencida" en pedidos autenticados.
      // En el login mismo (auth: false) un 401 es "credenciales incorrectas"
      // y tiene que mostrarse tal cual, no como sesión expirada.
      clearSession();
      location.hash = "#/login";
      throw new Error("Sesión expirada");
    }

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const detalle = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      throw new Error(detalle || `Error ${resp.status}`);
    }

    if (resp.status === 204) return null;
    return resp.json();
  }

  return {
    login: (email, password) => request("/auth/login", { method: "POST", body: { email, password }, auth: false }),
    logout: clearSession,
    isAuthenticated: () => !!token(),
    rol: () => localStorage.getItem("marcados_rol"),
    nombre: () => localStorage.getItem("marcados_nombre"),
    setSession,

    dashboardResumen: () => request("/dashboard/resumen"),
    alertasResumen: () => request("/dashboard/alertas-resumen"),
    alertasPersona: (personaId) => request(`/personas/${personaId}/alertas`),

    personas: () => request("/personas"),
    persona: (id) => request(`/personas/${id}`),
    editarPersona: (id, data) => request(`/personas/${id}`, { method: "PATCH", body: data }),
    crearPersona: (data) => request("/personas", { method: "POST", body: data }),
    buscarCoincidencias: (q) => request(`/personas/buscar/coincidencias?q=${encodeURIComponent(q)}`),
    marcarServidor: (personaId, fecha_inicio_servicio) =>
      request(`/personas/${personaId}/marcar-servidor`, { method: "POST", body: { fecha_inicio_servicio } }),
    fichasIncompletas: () => request("/personas/fichas-incompletas"),
    invitacionesResumen: (periodo) => request(`/personas/invitaciones-resumen?periodo=${periodo}`),
    historialSeguimiento: (personaId) => request(`/seguimiento/persona/${personaId}`),
    crearSeguimiento: (data) => request("/seguimiento", { method: "POST", body: data }),
    catalogo: (tipo) => request(`/catalogos/${tipo}`),

    crearOReusarEvento: (data) => request("/eventos", { method: "POST", body: data }),
    listarEventos: () => request("/eventos"),
    registrarAsistencia: (data) => request("/asistencia", { method: "POST", body: data }),
    verAsistenciaEvento: (eventoId) => request(`/eventos/${eventoId}/asistencia`),
    quitarAsistencia: (id) => request(`/asistencia/${id}`, { method: "DELETE" }),

    previewImportarLista: (data) => request("/asistencia/importar/preview", { method: "POST", body: data }),
    confirmarImportarLista: (data) => request("/asistencia/importar/confirmar", { method: "POST", body: data }),

    usuarios: () => request("/usuarios"),
    crearUsuario: (data) => request("/usuarios", { method: "POST", body: data }),
    desactivarUsuario: (id) => request(`/usuarios/${id}/desactivar`, { method: "PATCH" }),

    async descargarExcel() {
      const resp = await fetch(`${BASE_URL}/export/excel`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${resp.status}`);
      }
      return resp.blob();
    },
  };
})();
