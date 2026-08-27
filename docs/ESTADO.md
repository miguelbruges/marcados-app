# Estado de implementación — MARCADOS app

Checklist vivo. Actualizar al final de cada sesión de trabajo sobre este
repo (separado del checklist de trabajo sobre el Excel, que vive en la skill
`marcados-sistema` de Claude). Última actualización: 2026-08-27.

Si estás retomando el proyecto en un chat nuevo, leé primero
`docs/HANDOFF.md`: ahí están las reglas que no se negocian y las trampas
que ya costaron tiempo.

## En producción

`https://marcados-app.onrender.com` — Render + Supabase/Postgres, 120
jóvenes reales cargados, en uso por el equipo de consolidación. 210 tests
backend, todos pasando.

- Auth JWT (bcrypt) con 4 roles (admin/líder/encargado/consolidación) y
  acceso por rol al seguimiento pastoral y semáforo de asistencia.
- Personas: alta, edición, ficha completa (% + datos faltantes), bitácora
  de cambios, matching difuso de nombres para evitar duplicados.
- Asistencia: registro por evento, importación de listas pegadas (estilo
  WhatsApp) con matching y confirmación manual, y calendario permanente
  para ver y editar la asistencia de cualquier día.
- Servicio: áreas de servicio, marcar/quitar servidor, ranking de
  invitaciones por período.
- Seguimiento pastoral + semáforo de asistencia (operativo, nunca
  espiritual — eso lo fija siempre una persona a mano).
- Excel: un solo flujo de importación que reconcilia por ID único (crea
  a quien falta y actualiza a quien cambió en la misma subida, con dry-run
  y confirmación), y exportación usando el libro real como plantilla,
  marcada para recalcular las fórmulas al abrir.
- Detección y fusión de fichas duplicadas (siempre con decisión humana; la
  ficha absorbida se archiva, nunca se borra).
- "Ver la app como…": el admin puede mirar la pantalla tal como la ve un
  líder, encargado o consolidación (cambia lo que se muestra, no los
  permisos).
- Bot de Telegram de solo consulta.
- PWA instalable (ícono/logo propio, banner de instalación Android/iOS),
  service worker con estrategia red-primero para el shell.
- Red de seguridad de esquema (`schema_guard.py`) para cuando Alembic no
  aplica una migración en el deploy de Render (pasó al menos dos veces).

Detalle de cada pieza, `README.md` (raíz del repo). Decisiones de diseño,
`docs/ARQUITECTURA.md`.

## Auditoría 2026-08-14 — completa

Pedido del usuario: revisar todo el sistema y sacar una lista de mejoras.
Las cinco quedaron resueltas:

- [x] Actualizar README y este archivo (estaban describiendo un estado de
      hace semanas — SQLite efímero, sin datos reales, 39 tests).
- [x] Límite de intentos de login (rate limiting) — 5 fallos seguidos con
      el mismo email bloquean 15 minutos.
- [x] Checklist de "pendientes por confirmar" (servidor/bautizado) —
      `GET /personas/pendientes-revision`, usando la Bitácora existente
      como fuente de verdad. Pantalla enlazada desde Jóvenes.
- [x] Paginación en `GET /personas` — `limit`/`offset` opcionales, sin
      cambiar el comportamiento por defecto.
- [x] Separar `frontend/js/app.js` (1897 líneas) en módulos por pantalla
      (`app-core.js`, `app-panel.js`, `app-admin.js`, `app-personas.js`,
      `app-asistencia.js`, `app-bootstrap.js`) — mismo comportamiento,
      verificado con Playwright en las 15 pantallas + flujos interactivos
      (editar ficha, togglear servidor/bautizado, registrar asistencia,
      crear usuario, agregar joven). Se actualizó también el
      `service-worker.js` (SHELL cacheaba `js/app.js`, que ya no existe).

## Sesión 2026-08-24 al 27 — completa

Arrancó con un problema real reportado: "ayer se tomó asistencia y no se
ve reflejado en ningún lado". Detalle largo en `docs/HANDOFF.md` §5.

- [x] Excel: unificar las dos pantallas opuestas (cargar inicial /
      actualizar) en un solo `POST /migracion/importar` que reconcilia por
      ID único.
- [x] Asistencia que se perdía en silencio: al pegar una lista, las líneas
      sin coincidencia automática quedaban con "Ignorar" marcado y se
      guardaban así sin avisar. **Era la causa del reporte del usuario.**
- [x] Semáforo: mínimo de reuniones de 2 → 1, y fuera la pestaña de 7 días
      (estructuralmente nunca tenía datos, con encuentro semanal).
- [x] Calendario permanente en Asistencia, con la lista del día editable.
- [x] Campo libre para la actividad "Otro / Evento esporádico" (la
      detección comparaba con "Otro" exacto y nunca se activaba).
- [x] Fuera el KPI "Asistieron · 30 días" (no aportaba nada).
- [x] Alertas: rediseño, explicación de cada lista y —lo importante— ahora
      se pueden resolver (`PATCH /seguimiento/{id}/resolver`); antes la
      marca "requiere atención" se ponía pero no se sacaba.
- [x] Fichas duplicadas: detección + fusión. La primera versión daba 6
      falsos positivos sobre 7 grupos con los datos reales; corregida y
      re-verificada (ver `docs/HANDOFF.md` §6, vale la pena leerlo).
- [x] Servidor y bautizado salen de la vista de lectura y aparecen al
      tocar "Editar".
- [x] Teléfonos y correos tocables (`tel:` / `mailto:`) — la app se usa
      desde el celular en medio de una reunión.
- [x] `?v=N` en el CSS y los JS (y el mismo número en `service-worker.js`):
      sin eso un despliegue ya subido seguía sin verse en el celular.

## Pendiente — más adelante, sin bloqueo técnico inmediato

- [ ] Fusionar el duplicado real que quedó detectado (MAR-000026 /
      MAR-000132). Lo tiene que hacer el usuario desde la app: el agente no
      llega a producción.
- [ ] Confirmar qué plantilla de Excel quedó en producción (si el export
      trae 120 filas viejas o una hoja `Z_RESPALDO Jovenes`, es la
      original, no la limpia).
- [ ] Notificaciones push (alertas del semáforo sin tener que abrir la
      app).
- [ ] Recordatorio de cumpleaños (el dato `fecha_nacimiento` ya existe).
- [ ] Copias de seguridad automáticas de Supabase — hoy el respaldo es
      manual vía "Exportar a Excel".
- [ ] Diagnosticar la causa raíz de que Alembic a veces no aplique
      migraciones en el deploy de Render (hoy solo está parchado por
      `schema_guard.py`, no resuelto de fondo — sin acceso a los logs de
      Render desde acá).
- [ ] Expandir a todas las áreas de servicio de MARCADOS, con
      Consolidación como un segmento más (pedido del usuario, visión a
      futuro). El modelo de datos ya es genérico (`AreaServicio` no está
      atado a Consolidación) — falta sobre todo definir permisos por área
      (¿un líder ve solo su área o todo, como hoy?) antes de expandir.
- [ ] Dominio propio (Render ya da HTTPS en su subdominio).
- [ ] Integración WhatsApp Business API (hoy es pegar el texto a mano) —
      requiere cuenta Business y decisión de qué proveedor usar.
