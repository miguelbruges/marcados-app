# Estado de implementación — MARCADOS app

Checklist vivo. Actualizar al final de cada sesión de trabajo sobre este
repo (separado del checklist de trabajo sobre el Excel, que vive en la skill
`marcados-sistema` de Claude).

## Hecho

- [x] Repo independiente `marcados-app`, separado de `github-pages`.
- [x] Backend FastAPI + SQLAlchemy + Alembic. Modelos: Persona, AreaServicio,
      PersonaArea, Actividad, Evento, Asistencia, Seguimiento, Usuario,
      Catalogo.
- [x] Auth JWT (bcrypt, roles admin/lider).
- [x] Matching difuso de nombres con niveles de confianza y regla de
      ambigüedad (caso Anthony como test de referencia).
- [x] Asistencia idempotente por (persona, evento); creación de evento
      idempotente por (actividad, fecha).
- [x] 20 tests backend, todos pasando.
- [x] Frontend PWA responsive (sin build step): login → panel → registrar
      asistencia (buscar/sugerencias/tocar/confirmar) → agregar joven.
      Probado end-to-end en navegador con viewport móvil (390×844).
- [x] `.gitignore` bloqueando Excel/DB/.env/credenciales.
- [x] Plantilla de migración de Excel (`backend/migration/import_excel.py`) —
      no ejecutada contra datos reales.
- [x] **Checkpoint visual (importación de lista tipo WhatsApp).** Parser que
      separa nombres de un texto pegado ignorando encabezados ("asistencia
      culto juvenil 25/07/2026"), endpoints `/asistencia/importar/preview`
      (matching por línea, no guarda nada) y `/asistencia/importar/confirmar`
      (guarda solo lo que el líder confirmó, idempotente). Frontend: página
      "Jóvenes" de solo lectura y página "Importar" con las dos secciones
      pedidas (coincidencias encontradas / pendientes por confirmar) y
      selección manual por radio buttons. 31 tests backend, todos pasando.
      Probado end-to-end en navegador con viewport móvil: el caso Anthony
      (ambiguo) quedó correctamente en pendientes sin auto-guardarse.
- [x] **Fecha de ingreso automática.** `POST /personas` fija `fecha_ingreso`
      a hoy si no se manda explícita — nadie tiene que acordarse de
      escribirla al dar de alta un joven nuevo.
- [x] **Nuevo servidor (reunión STAFF).** `POST /personas/{id}/marcar-servidor`
      marca `servidor=true` y fija `fecha_inicio_servicio` (hoy por defecto,
      o la fecha de la reunión si se manda). Página frontend con el mismo
      buscador difuso que asistencia, enlazada desde "Jóvenes". 36 tests
      backend pasando. Probado end-to-end en navegador.
- [x] **Desplegado en Render.** Repo creado (`miguelbruges/marcados-app`),
      backend live en `https://marcados-app.onrender.com`. `render.yaml`
      (build/start con Alembic), admin bootstrap por variables de entorno
      (sincroniza la contraseña en cada arranque, no solo la crea).
- [x] **Frontend servido desde el mismo origen que la API** (no GitHub
      Pages). Se abandonó el split Render+GitHub Pages: en pruebas reales
      desde celular, la comunicación cross-origin entre esos dos dominios
      fallaba de forma intermitente e indiagnosticable a distancia (un
      pedido idéntico simulado desde una máquina con internet normal
      funcionaba perfecto; el mismo pedido real desde el celular, en más de
      un dispositivo, no). FastAPI monta `frontend/` como estáticos —
      `render.yaml` no necesita segundo servicio, `CORS_ORIGINS` ya no es
      crítico para el uso normal. 42 tests backend pasando.
- [x] Bug de login corregido: el frontend mostraba "contraseña incorrecta"
      para cualquier error (de red, CORS, lo que fuera), lo que hizo perder
      mucho tiempo de diagnóstico durante el despliegue — ahora muestra el
      error real.

## Pendiente — bloqueado por datos que no existen en este entorno

- [ ] Migrar el Excel baseline real. El archivo no está en este entorno de
      desarrollo ni se encontró en el Google Drive conectado. El usuario
      necesita proveerlo (o indicar dónde está) antes de poder ejecutar
      `import_excel.py` de verdad.
- [ ] Recuperar en el Excel las 5 columnas mencionadas como desaparecidas
      (fecha de ingreso, fecha de bautismo, fecha inicio en servicio, edad
      manual, asistencia últimos 30 días) — depende del mismo archivo.
- [ ] Caso Anthony (filas 5 y 135 del Excel histórico): sigue sin resolverse,
      requiere decisión humana. En la app, cuando se migren datos reales,
      debe entrar como dos `Persona` separadas hasta que se decida.

## Pendiente — construible sin datos externos

- [ ] Catálogos reales (estados, cómo llegó, fuente de datos) — hoy el
      modelo `Catalogo` existe pero no está poblado con valores del
      ministerio.
- [ ] CRUD de edición/desactivación de personas (hoy solo hay alta y
      lectura).
- [ ] Gestión de Áreas de servicio y asignación Persona↔Área desde la UI.
- [ ] Pantalla de seguimiento (el modelo y endpoints ya existen).
- [ ] Dashboard más completo (fluctuantes, sin seguimiento, asistencia por
      período) — a propósito se dejó mínimo primero.
- [ ] **Exportar a Excel bajo demanda** (pedido explícito del usuario): un
      botón para generar un Excel descargable con los datos actuales de la
      app (jóvenes, asistencia). Es exportación unidireccional app→Excel
      para reportes puntuales — no es sincronización automática ni el Excel
      vuelve a ser la fuente de datos.
- [ ] Usuarios/roles: hoy solo existe el admin creado por variables de
      entorno. Falta pantalla/endpoint para que el admin cree líderes.

## Pendiente — requiere credenciales o decisión de negocio del usuario

- [ ] Base de datos persistente de producción (Postgres/Supabase) — el
      despliegue en Render usa SQLite efímero mientras tanto, solo para
      probar que la app funciona, no para datos reales.
- [ ] Integración WhatsApp Business API — requiere cuenta Business y
      decisión de qué proveedor usar.

## Próxima acción recomendada

1. Usuario prueba el login en `https://marcados-app.onrender.com` desde el
   celular (mismo origen ahora, debería resolver el error 405 persistente).
2. Usuario indica dónde está el Excel baseline real → se ejecuta la
   migración con `--dry-run` primero.
3. Seguir con usuarios/roles, exportar a Excel, y el resto del dashboard.
