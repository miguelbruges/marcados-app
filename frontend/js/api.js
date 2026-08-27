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
    localStorage.removeItem(LS_VISTA_ROL);
  }

  // --- "Ver la app como…" (pedido del usuario, 2026-08-24) ---
  // Solo cambia lo que la interfaz MUESTRA: el token sigue siendo el del
  // admin, así que esto no prueba los permisos del backend, sirve para ver
  // cómo le queda la pantalla a cada rol. Es seguro justamente porque solo
  // puede QUITAR interfaz, nunca agregar: el backend decide aparte y ahí
  // el admin sigue siendo admin.
  const LS_VISTA_ROL = "marcados_vista_rol";
  const ROLES_QUE_SE_PUEDEN_VER = ["lider", "encargado", "consolidacion"];

  function rolReal() {
    return localStorage.getItem("marcados_rol");
  }

  function rolVista() {
    const vista = localStorage.getItem(LS_VISTA_ROL);
    // Solo un admin de verdad puede estar en modo vista. Si el rol real
    // cambió (otra sesión, otro usuario), la vista guardada se ignora.
    if (!vista || rolReal() !== "admin") return null;
    return ROLES_QUE_SE_PUEDEN_VER.includes(vista) ? vista : null;
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
    // rol() es el rol EFECTIVO para la interfaz: si el admin está mirando
    // la app "como" otro rol, devuelve ese. Todas las pantallas ya se
    // guardan con esto, así que la vista previa sale gratis y fiel.
    rol: () => rolVista() || rolReal(),
    rolReal,
    rolVista,
    rolesQueSePuedenVer: () => [...ROLES_QUE_SE_PUEDEN_VER],
    verComoRol(rol) {
      if (rolReal() !== "admin") throw new Error("Solo un administrador puede usar la vista por rol.");
      if (!ROLES_QUE_SE_PUEDEN_VER.includes(rol)) throw new Error(`Rol desconocido: ${rol}`);
      localStorage.setItem(LS_VISTA_ROL, rol);
    },
    salirDeVistaRol: () => localStorage.removeItem(LS_VISTA_ROL),
    nombre: () => localStorage.getItem("marcados_nombre"),
    setSession,

    dashboardResumen: () => request("/dashboard/resumen"),
    alertasResumen: (ventanaDias) => request(`/dashboard/alertas-resumen${ventanaDias ? "?ventana_dias=" + ventanaDias : ""}`),
    alertasDetalle: (nivel, ventanaDias) =>
      request(`/dashboard/alertas-detalle?nivel=${nivel}${ventanaDias ? "&ventana_dias=" + ventanaDias : ""}`),
    alertasPersona: (personaId) => request(`/personas/${personaId}/alertas`),

    personas: (activo) => request(`/personas${activo === undefined ? "" : "?activo=" + activo}`),
    persona: (id) => request(`/personas/${id}`),
    editarPersona: (id, data) => request(`/personas/${id}`, { method: "PATCH", body: data }),
    crearPersona: (data) => request("/personas", { method: "POST", body: data }),
    buscarCoincidencias: (q) => request(`/personas/buscar/coincidencias?q=${encodeURIComponent(q)}`),
    marcarServidor: (personaId, fecha_inicio_servicio) =>
      request(`/personas/${personaId}/marcar-servidor`, { method: "POST", body: { fecha_inicio_servicio } }),
    fichasIncompletas: () => request("/personas/fichas-incompletas"),
    pendientesRevision: () => request("/personas/pendientes-revision"),
    invitacionesResumen: (periodo) => request(`/personas/invitaciones-resumen?periodo=${periodo}`),
    areasServicio: () => request("/areas-servicio"),
    actualizarAreasPersona: (personaId, areaIds) =>
      request(`/personas/${personaId}/areas`, { method: "PUT", body: { area_ids: areaIds } }),
    historialSeguimiento: (personaId) => request(`/seguimiento/persona/${personaId}`),
    crearSeguimiento: (data) => request("/seguimiento", { method: "POST", body: data }),
    seguimientosRequierenAtencion: () => request("/seguimiento/requieren-atencion"),
    resolverSeguimiento: (id) => request(`/seguimiento/${id}/resolver`, { method: "PATCH" }),
    catalogo: (tipo) => request(`/catalogos/${tipo}`),

    actividades: () => request("/actividades"),
    crearOReusarEvento: (data) => request("/eventos", { method: "POST", body: data }),
    eventosPorRango: (desde, hasta) => request(`/eventos?desde=${desde}&hasta=${hasta}`),
    registrarAsistencia: (data) => request("/asistencia", { method: "POST", body: data }),
    verAsistenciaEvento: (eventoId) => request(`/eventos/${eventoId}/asistencia`),
    quitarAsistencia: (id) => request(`/asistencia/${id}`, { method: "DELETE" }),

    previewImportarLista: (data) => request("/asistencia/importar/preview", { method: "POST", body: data }),
    confirmarImportarLista: (data) => request("/asistencia/importar/confirmar", { method: "POST", body: data }),

    usuarios: () => request("/usuarios"),
    crearUsuario: (data) => request("/usuarios", { method: "POST", body: data }),
    desactivarUsuario: (id) => request(`/usuarios/${id}/desactivar`, { method: "PATCH" }),

    estadoPlantilla: () => request("/export/plantilla/estado"),

    async subirPlantilla(archivo) {
      const formData = new FormData();
      formData.append("archivo", archivo);
      const resp = await fetch(`${BASE_URL}/export/plantilla`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: formData,
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${resp.status}`);
      }
    },

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

    async importarExcel(archivo, confirmar) {
      const formData = new FormData();
      formData.append("archivo", archivo);
      const resp = await fetch(`${BASE_URL}/migracion/importar?confirmar=${confirmar ? "true" : "false"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: formData,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detalle = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        throw new Error(detalle || `Error ${resp.status}`);
      }
      return data;
    },
  };
})();
