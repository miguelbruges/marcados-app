# MARCADOS

Sistema de gestión de jóvenes, asistencia y seguimiento — ministerio MARCADOS
(iglesia Fuente de Vida, Santa Marta). Reemplaza progresivamente al Excel
maestro, que queda como fuente histórica congelada.

## Estado

**En producción**, en uso real por el equipo de consolidación:
https://marcados-app.onrender.com — backend en Render, base de datos en
Supabase/Postgres, 120 jóvenes reales cargados. Ver `docs/ARQUITECTURA.md`
para decisiones de diseño y `docs/ESTADO.md` para el checklist de avance
(actualizar ambos al terminar cada sesión de trabajo — se desactualizan
fácil si no).

Funciona como PWA instalable (ícono propio, banner de "Instalar app" en
Android/iOS) — no hay APK ni publicación en tiendas de aplicaciones.

**No incluido todavía:** importación directa de WhatsApp (hoy es pegar el
texto a mano), reportes avanzados más allá de Excel, paginación en listados
grandes, notificaciones push, dominio propio.

## Estructura

```
backend/    FastAPI + SQLAlchemy + Alembic (API, modelos, matching, tests)
frontend/   PWA responsive sin build step (HTML/CSS/JS vanilla)
docs/       Arquitectura y estado de avance
```

## Backend — desarrollo local

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # y completar SECRET_KEY

python scripts/seed_dev.py   # crea admin@marcadosapp.dev / admin1234 y la actividad base
ENVIRONMENT=development uvicorn app.main:app --reload
```

API en `http://localhost:8000`, docs interactivas en `/docs`.

Tests: `pytest tests/ -v` (167 tests — matching, auth, personas, asistencia,
importación de listas, bootstrap de admin, alertas de asistencia, bitácora,
migración de Excel, exportación, Telegram, esquema/`schema_guard`, y más).

### Migraciones (Alembic)

En desarrollo, `create_all` basta (se ejecuta solo al levantar la app). En
producción el esquema se gestiona con Alembic:

```bash
alembic upgrade head                              # aplicar
alembic revision --autogenerate -m "descripción"  # nueva migración
```

**Alembic no siempre corrió de verdad en el deploy de Render** (visto al
menos dos veces: `cuenta_para_semaforo` en actividades, y el reinicio de
servidor/bautizado — el resto de la app seguía funcionando con normalidad,
sin error visible, así que costó detectarlo). Causa exacta sin confirmar
todavía (¿el `startCommand` no propaga el fallo? ¿algo en el build?) — sin
acceso a los logs de Render desde acá para diagnosticar más. Mientras tanto,
`app/services/schema_guard.py` es una red de seguridad que corre al
arrancar la app y aplica en SQL directo lo que Alembic debería haber
aplicado, de forma idempotente. **No reemplaza a Alembic** — cualquier
cambio de esquema sigue necesitando su migración normal; `schema_guard` es
solo el respaldo si esa migración no llegó a correr.

## Frontend — desarrollo local

Sin paso de build. Cualquier servidor estático sirve:

```bash
cd frontend
python3 -m http.server 5500
```

Abrir `http://localhost:5500/index.html` (o desde el celular, la IP de la
máquina en la misma red). Por defecto apunta a `http://localhost:8000`; para
otro backend, definir `window.MARCADOS_API_URL` antes de cargar `js/api.js`.

**En producción no hace falta ningún servidor aparte para el frontend** — ver
la sección de despliegue más abajo. Este modo de servirlo por separado es
solo para desarrollo local.

## Migración desde el Excel

`backend/migration/migrar_datos_reales.py` implementa el contrato de la
sección 15 de `MARCADOS_DATA_HANDOFF` (39 columnas de la hoja Jóvenes, más
los 15 catálogos de la hoja Catálogos). Ya se corrió contra el Excel real
hacia una base de prueba local — nunca hacia el despliegue de Render, cuyo
disco es efímero (ver más abajo). Para repetirla contra otro archivo:

1. `python -m migration.migrar_datos_reales --excel /ruta/al/excel.xlsx --dry-run`
   y revisar el reporte (IDs duplicados, sin nombre/apellido, sin Estado,
   teléfonos compartidos — nada se fusiona automáticamente, todo queda
   marcado para revisión humana en Seguimiento).
2. Recién entonces correr sin `--dry-run`. Se niega a correr si la base ya
   tiene personas — nunca sobrescribe en silencio.

`backend/migration/import_excel.py` es una plantilla genérica anterior, sin
usar; se mantiene solo como referencia histórica.

## Cargar el Excel real en producción (sin acceso directo a la base)

`POST /migracion/excel` (solo admin, multipart) sube el Excel real y corre
la misma migración del script de línea de comandos, directo contra la base
en vivo — pensado para cuando no hay forma de conectarse directo a la base
de datos de producción (p.ej. Supabase) desde fuera. Flujo: `confirmar=false`
(o sin el parámetro) es una vista previa que no escribe nada; `confirmar=true`
escribe de verdad, y aun así se niega con 409 si la base ya tiene personas —
nunca sobrescribe en silencio. La lógica de negocio (mapeo de columnas,
validaciones, reglas de "no inventar datos") vive en un solo lugar,
`app/services/migracion_excel.py`, compartida con `migration/migrar_datos_reales.py`
(el script de CLI, para desarrollo local) — nunca hay dos copias que puedan
desincronizarse. Pantalla en el panel (solo admin): "Cargar Excel real".

## Ficha completa y fichas incompletas

Cada persona expone `ficha_completa_pct` y `datos_faltantes`, calculados
sobre los 14 campos clave de la sección 17 del handoff (nunca se guardan:
se recalculan al vuelo). `GET /personas/fichas-incompletas` devuelve las
fichas por debajo del umbral configurado (`FICHA_COMPLETA_UMBRAL_PORCENTAJE`,
70% por defecto) — nunca bloquea el registro de nadie, es solo información
operativa para priorizar seguimiento.

## Motor de alertas de asistencia

`GET /personas/{id}/alertas` y `GET /dashboard/alertas-resumen` replican el
'Semáforo de asistencia' del Excel (columnas AG-AJ, sección 15/21 del
handoff): % de asistencia en una ventana de días (30 por defecto,
`ALERTAS_VENTANA_DIAS`), verde/amarillo/rojo/sin datos según umbrales
configurables (`ALERTAS_UMBRAL_VERDE`/`ALERTAS_UMBRAL_AMARILLO`, 85%/50% por
defecto — mismos valores que trae el Excel), más inasistencias consecutivas.
Es una alerta **operativa**, nunca una conclusión espiritual — por eso vive
separada de `semaforo_espiritual`, que siempre lo fija una persona a mano
(regla no negociable, sección 21).

## Ranking de invitaciones

Pedido del usuario (2026-08-10): ver quién invitó más jóvenes que se
registraron en un período (mes/trimestre/semestre), para que el equipo
decida un reconocimiento si quiere — la app solo cuenta, no decide nada.

`Persona.invitado_por_id` es un campo nuevo, estructurado (referencia a otra
Persona ya existente), distinto de `como_llego` (texto libre histórico del
Excel, ej. "Primo de Cristal", "Staff" — no sirve para este ranking porque
no identifica una persona concreta del sistema). Solo se llena hacia
adelante, al dar de alta un joven nuevo (buscador difuso reutilizado de
asistencia/servidores) — los 120 registros históricos no lo tienen.

`GET /personas/invitaciones-resumen?periodo=mes|trimestre|semestre` (o
`?desde=...&hasta=...` para un rango explícito) devuelve el ranking
ordenado. Visible para todos los roles con sesión — es parte del trabajo
del equipo de consolidación, no información pastoral sensible.

## Exportar a Excel (plantilla real)

`GET /export/excel` (solo admin) genera un `.xlsx` idéntico en diseño al
libro real: usa el archivo real como plantilla (`openpyxl.load_workbook`,
sin tocar fórmulas, catálogos ni formato), solo reemplaza las filas de datos
de Jóvenes y Asistencia, y ajusta el rango de cada tabla al número real de
filas. Requiere `EXCEL_TEMPLATE_PATH` apuntando a una copia del archivo real
en el servidor (nunca en el repo — ver abajo). Seguimiento y Servicio
todavía no se exportan: sus columnas no tienen un mapeo exacto ya poblado en
el modelo actual, y no se quiso inventar uno.

## Bot de Telegram (solo consulta)

Sección 19 del handoff: un bot de Telegram para consultar datos de una
persona por nombre desde el celular, sin abrir la app — nunca escribe nada,
respeta los mismos permisos por rol que la web (el chat de Telegram se
vincula a un usuario ya existente en el sistema, no crea cuentas nuevas).
Configuración: `TELEGRAM_BOT_TOKEN` (se obtiene hablándole a @BotFather en
Telegram) — sin el token, el webhook responde 503 en vez de fallar de forma
confusa. Lógica en `app/services/telegram_bot.py`, webhook en
`app/routers/telegram.py`.

## Seguridad y datos personales

- El Excel, cualquier base de datos con información real, y la plantilla de
  export **nunca** se suben al repositorio — ver `.gitignore` (bloquea
  `*.xlsx`, `*.db`, `.env`, etc.). `EXCEL_TEMPLATE_PATH` apunta a un archivo
  que vive solo en el servidor.
- Autenticación JWT, contraseñas con bcrypt, CORS restringido por variable
  de entorno, roles admin/líder/encargado/consolidación, bitácora de
  cambios (quién, qué campo, valor anterior/nuevo, cuándo).
- El semáforo espiritual y cualquier conclusión de seguimiento pastoral son
  siempre decisión humana — el sistema nunca las calcula automáticamente.
- **Acceso por rol** (definido con el usuario, 2026-08-10): la ficha general
  de cada joven (datos de contacto, ficha completa) la ve cualquier usuario
  con sesión — hoy eso es líderes y el equipo de consolidación, los únicos
  con cuenta. El **seguimiento pastoral** y el **semáforo de asistencia**
  (`GET /personas/{id}/alertas`, `GET /dashboard/alertas-resumen`,
  `POST /seguimiento`, `GET /seguimiento/persona/{id}`) son solo para
  `admin`, `lider` y `encargado` — hoy eso es Miguel, Nelson y Amy
  (Encargada de Consolidación). El resto del equipo de consolidación
  (Klareth, Sofía, Lucía, rol `consolidacion`) no accede a esas rutas
  (403) y el frontend ni siquiera muestra esas secciones para ese rol.

## Producción (ya desplegada)

`https://marcados-app.onrender.com` — un solo servicio Render (`marcados-api`
en `render.yaml`) sirve el frontend y la API desde el mismo origen (evita
CORS entre sitios distintos, que algunas redes móviles bloquean de formas
difíciles de diagnosticar a distancia). Base de datos: Supabase/Postgres
(`DATABASE_URL` apunta a la connection string de Supabase, configurada en el
dashboard de Render, nunca en `render.yaml` ni en el repo). 120 jóvenes
reales cargados.

Para desplegar una instancia nueva desde cero (paso manual, requiere cuenta
propia — no se puede hacer desde el asistente):

1. En https://render.com: **New > Blueprint**, conectar este repo. Render lee
   `render.yaml` y propone el servicio `marcados-api` solo.
2. Completar las variables marcadas como manuales: `ADMIN_BOOTSTRAP_EMAIL` /
   `ADMIN_BOOTSTRAP_PASSWORD` (usuario admin inicial, se crea/actualiza solo
   al arrancar), `CORS_ORIGINS` (vacío alcanza, mismo origen). `SECRET_KEY`
   se genera sola.
3. Crear un proyecto en https://supabase.com, copiar el "Connection string"
   (modo *Session pooler* o *Direct connection*) y ponerlo como
   `DATABASE_URL` en el dashboard de Render del servicio (no en
   `render.yaml` — la contraseña no va a git).
4. Deploy. `alembic upgrade head` corre solo al arrancar (`startCommand` en
   `render.yaml`) y crea el esquema completo en Postgres — pero ver la nota
   sobre Alembic más arriba, no siempre corre de verdad; revisar los logs de
   Render tras el primer deploy.
5. Cargar datos reales: `POST /migracion/excel` desde el panel de admin
   ("Cargar Excel real"), o `migration/migrar_datos_reales.py` apuntando
   `DATABASE_URL` a esa misma base.

**Capa gratuita de Render:** el servicio duerme tras ~15 min de
inactividad — el próximo pedido tarda 20-30s en despertar. Un pinger externo
(UptimeRobot, cron-job.org) pegándole a `/health` cada 5 min lo evita.

Pendiente, sin bloqueo técnico: dominio propio (Render ya da HTTPS en su
subdominio), copias de seguridad automáticas de Supabase (hoy el respaldo es
manual vía "Exportar a Excel"), paginación en listados si la app crece más
allá de unos cientos de personas.
