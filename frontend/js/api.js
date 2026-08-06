// Cliente HTTP mínimo. Sin dependencias externas a propósito — este frontend
// no tiene paso de build, debe poder abrirse sirviendo estos archivos tal cual.
const Api = (() => {
  // Ajustar en despliegue real (o exponer vía variable inyectada por el servidor
  // estático). En desarrollo local, FastAPI corre en 8000.
  const BASE_URL = window.MARCADOS_API_URL || "http://localhost:8000";

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

    if (resp.status === 401) {
      clearSession();
      location.hash = "#/login";
      throw new Error("Sesión expirada");
    }

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.detail ? JSON.stringify(data.detail) : `Error ${resp.status}`);
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

    personas: () => request("/personas"),
    crearPersona: (data) => request("/personas", { method: "POST", body: data }),
    buscarCoincidencias: (q) => request(`/personas/buscar/coincidencias?q=${encodeURIComponent(q)}`),

    crearOReusarEvento: (data) => request("/eventos", { method: "POST", body: data }),
    listarEventos: () => request("/eventos"),
    registrarAsistencia: (data) => request("/asistencia", { method: "POST", body: data }),
    verAsistenciaEvento: (eventoId) => request(`/eventos/${eventoId}/asistencia`),
    quitarAsistencia: (id) => request(`/asistencia/${id}`, { method: "DELETE" }),

    previewImportarLista: (data) => request("/asistencia/importar/preview", { method: "POST", body: data }),
    confirmarImportarLista: (data) => request("/asistencia/importar/confirmar", { method: "POST", body: data }),
  };
})();
