# Estado de implementación — MARCADOS app

Checklist vivo. Actualizar al final de cada sesión de trabajo sobre este
repo (separado del checklist de trabajo sobre el Excel, que vive en la skill
`marcados-sistema` de Claude). Última actualización: 2026-08-14.

## En producción

`https://marcados-app.onrender.com` — Render + Supabase/Postgres, 120
jóvenes reales cargados, en uso por el equipo de consolidación. 167 tests
backend, todos pasando.

- Auth JWT (bcrypt) con 4 roles (admin/líder/encargado/consolidación) y
  acceso por rol al seguimiento pastoral y semáforo de asistencia.
- Personas: alta, edición, ficha completa (% + datos faltantes), bitácora
  de cambios, matching difuso de nombres para evitar duplicados.
- Asistencia: registro por evento, importación de listas pegadas (estilo
  WhatsApp) con matching y confirmación manual.
- Servicio: áreas de servicio, marcar/quitar servidor, ranking de
  invitaciones por período.
- Seguimiento pastoral + semáforo de asistencia (operativo, nunca
  espiritual — eso lo fija siempre una persona a mano).
- Migración/actualización de Excel real (dry-run + confirmación, desde
  línea de comandos o subida en el panel de admin), exportación a Excel
  usando el libro real como plantilla.
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

## Pendiente — más adelante, sin bloqueo técnico inmediato

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
