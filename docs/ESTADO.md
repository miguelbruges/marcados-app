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

## Pendiente — auditoría 2026-08-14

Pedido del usuario: revisar todo el sistema y sacar una lista de mejoras.
En progreso, en orden:

- [x] Actualizar README y este archivo (estaban describiendo un estado de
      hace semanas — SQLite efímero, sin datos reales, 39 tests).
- [ ] Límite de intentos de login (rate limiting) — hoy no hay ningún
      freno a intentos repetidos de adivinar una contraseña.
- [ ] Checklist de "pendientes por confirmar" (servidor/bautizado) — se
      reiniciaron a False para las 120 personas reales (pedido del
      usuario, 2026-08-13) y hoy no hay forma de ver a quién ya se
      revisó, usando la Bitácora existente como fuente de verdad.
- [ ] Paginación en `GET /personas` — funciona con 120, no escala si la
      app crece a todas las áreas de MARCADOS.
- [ ] Separar `frontend/js/app.js` (1853 líneas) en módulos por pantalla
      — refactor mecánico, sin cambiar comportamiento.

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
