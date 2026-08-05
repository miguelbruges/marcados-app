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

## Pendiente — requiere credenciales o decisión de negocio del usuario

- [ ] Crear el repo `marcados-app` en GitHub (la integración de esta sesión
      no tiene permiso para crear repos — el usuario debe crearlo vacío en
      github.com/new y luego se conecta y se hace push).
- [ ] Deploy a producción (hosting backend/frontend, dominio, HTTPS).
- [ ] Base de datos de producción (Postgres/Supabase) — requiere cuenta y
      credenciales.
- [ ] Integración WhatsApp Business API — requiere cuenta Business y
      decisión de qué proveedor usar.

## Próxima acción recomendada

1. Usuario crea el repo vacío en GitHub → se conecta y se hace el push
   inicial de todo este trabajo.
2. Usuario indica dónde está el Excel baseline real → se ejecuta la
   migración con `--dry-run` primero.
3. Con datos reales cargados, seguir con catálogos y el resto del dashboard.
