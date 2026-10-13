# MARCADOS

Sistema de gestión de jóvenes, asistencia y seguimiento — ministerio MARCADOS
(iglesia Fuente de Vida, Santa Marta). Reemplaza progresivamente al Excel
maestro, que queda como fuente histórica congelada.

## Estado

**En producción**, en uso real por el equipo de consolidación:
https://marcados-app.onrender.com — backend en Render, base de datos en
Supabase/Postgres, 120 jóvenes reales cargados.

**¿Retomando el proyecto en un chat nuevo? Empezá por `docs/HANDOFF.md`** —
las reglas que no se negocian, las trampas que ya costaron tiempo y qué
quedó sin cerrar. Después, `docs/ARQUITECTURA.md` para decisiones de diseño
y `docs/ESTADO.md` para el checklist de avance (actualizar los tres al
terminar cada sesión de trabajo — se desactualizan fácil si no).

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

## Importar el Excel real en producción (sin acceso directo a la base)

`POST /migracion/importar` (solo admin, multipart) sube el Excel real y lo
reconcilia contra la base en vivo, directo — pensado para cuando no hay forma
de conectarse directo a la base de datos de producción (p.ej. Supabase) desde
afuera. Un solo flujo, por ID único (columna A): a quien no existe todavía lo
crea (igual que la migración inicial), y a quien ya existe y cambió lo
actualiza campo por campo (queda en Bitácora) — sirve tanto para la primera
carga en una base vacía como para cualquier sincronización posterior, cuando
el Excel se edita por fuera de la app y hay que traer esos cambios adentro.
Una celda en blanco nunca borra un dato ya cargado (excepto `servidor` y
`bautizado`, que son NOT NULL). Flujo: `confirmar=false` (o sin el parámetro)
es una vista previa que no escribe nada; `confirmar=true` escribe de verdad.
La lógica de negocio (mapeo de columnas, validaciones, reglas de "no inventar
datos") vive en un solo lugar, `app/services/migracion_excel.py`, compartida
con `migration/migrar_datos_reales.py` (el script de CLI, para desarrollo
local, que sigue siendo solo-creación y se niega si la base ya tiene
personas). Pantalla en el panel (solo admin): Administración → Excel →
"Importar Excel".

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
"Sin datos" significa que en la ventana no hubo ningún Encuentro cargado:
alcanza con una sola reunión para asignar color (`ALERTAS_MINIMO_EVENTOS`,
1 por defecto — estuvo en 2, pero con un encuentro semanal eso dejaba
períodos enteros sin poder evaluarse). Es una alerta **operativa**, nunca
una conclusión espiritual — por eso vive separada de `semaforo_espiritual`,
que siempre lo fija una persona a mano (regla no negociable, sección 21).

El centro de alertas (`/alertas` en la app) junta tres listas: semáforo en
rojo, fichas incompletas y seguimientos marcados "requiere atención". Esa
última marca la pone una persona al escribir la nota, o la importación del
Excel cuando un dato necesita decisión humana. Se baja con
`PATCH /seguimiento/{id}/resolver` — que solo apaga la bandera y deja la
nota intacta en el historial. Antes no había forma de sacarla, así que la
lista solo crecía y el contador quedaba clavado en 99+ con cosas ya
resueltas (pedido del usuario, 2026-08-24).

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
5. Cargar datos reales: `POST /migracion/importar` desde el panel de admin
   (Administración → Excel → "Importar Excel"), o `migration/migrar_datos_reales.py`
   apuntando `DATABASE_URL` a esa misma base.

### Por qué la app se mudó a Vercel (y Render quedó de respaldo)

La capa gratuita de Render apaga el servicio tras ~15 min sin tráfico y
despertarlo tarda 30-60s. Un líder que abre la app en medio de una reunión
espera casi un minuto mirando una pantalla negra. Ese era el problema.

**Lo que se intentó y no alcanzó.** Entre 2026-09 y 2026-10 se configuró un
pinger externo (cron-job.org contra `/health`, horas 6-23 America/Bogota)
para que el servicio nunca llegara a los 15 minutos de inactividad. El
usuario siguió encontrando la pantalla de arranque **a la 1 de la tarde**,
en pleno horario de uso. Dos límites lo hacían frágil aunque estuviera bien
configurado: Render da 750 horas de instancia por mes y por workspace contra
las 744 que tiene un mes, así que mantenerlo despierto 24/7 no entra; y la
cuenta gratuita de cron-job.org corta a los 30s mientras despertar Render
tarda ~50, con lo cual el primer ping de cada día figura como fallido aunque
haya funcionado — un fallo real queda indistinguible del ruido.

**Por qué no se pagó el plan.** No hay presupuesto para este proyecto. El
`render.yaml` dice `plan: free` a propósito: subirlo a `starter` genera un
cobro real. No lo cambies sin que el usuario lo pida.

**Por qué Vercel.** No existe hosting gratuito que no se duerma — Koyeb
duerme y además pide tarjeta, Cloud Run duerme. Pero dormirse no es el
problema: el problema es *cuánto tarda en despertar*. Render tarda 30-60s;
Vercel, 1-3s, que se siente instantáneo. Y Vercel es el único que no pide
tarjeta.

La app corre ahí como función serverless (`api/index.py`, `vercel.json`).
Es el **mismo** `app/main.py`, el mismo origen para API y frontend y la
misma base de Supabase — no hay una versión "de Vercel" del código.

**Lo único que cambia en el código** es el pool de conexiones
(`app/database.py`): en serverless cada invocación puede ser un proceso
nuevo, así que un pool no se reutiliza y solo deja conexiones abiertas hasta
agotar el límite de Postgres. Con `VERCEL=1` (que Vercel define sola) se usa
`NullPool` y el pooling lo hace Supabase. Fuera de Vercel esa rama no se
toca: Render y los tests se comportan igual que siempre.

**Variables de entorno en Vercel:** las mismas que en Render
(`DATABASE_URL`, `SECRET_KEY`, `ADMIN_BOOTSTRAP_EMAIL`,
`ADMIN_BOOTSTRAP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `ENVIRONMENT=production`).
En `DATABASE_URL` usar la connection string del **Transaction pooler** de
Supabase (puerto 6543), no la conexión directa: es la que está pensada para
serverless.

**Dos límites de Vercel que conviene tener presentes** (ninguno afecta el
uso diario, los dos afectan al Excel):

- El cuerpo de un pedido o una respuesta no puede pasar de **4,5 MB**. Subir
  una plantilla de Excel más grande que eso falla. La plantilla actual ya
  está guardada en la base, así que esto solo importa si se cambia.
- La exportación a Excel devuelve el libro armado. Si algún día pesa más de
  4,5 MB, ese endpoint va a fallar **y es el único respaldo de la base**
  (ver "Pendiente"). Hay que probarlo de verdad antes de dar de baja Render.

**Render queda levantado** (gratis, lento) hasta confirmar que Vercel anda
bien, incluida la exportación. No lo apagues antes de eso.

### Cuidado con `DATABASE_URL` en `render.yaml`

Hasta 2026-10 el blueprint traía `DATABASE_URL` con un
`value: sqlite:///./marcados.db` — la base de juguete del desarrollo local.
La real es la connection string de Supabase y vive **solo** en el dashboard,
porque lleva contraseña y no va a git.

Con ese `value:` puesto, un re-sync del blueprint pisaba la variable real
con el sqlite y la app arrancaba contra una base **vacía, sin dar ningún
error**: los 120 jóvenes simplemente no aparecían hasta restaurar la
variable a mano. Ahora está como `sync: false`, que le dice a Render que
respete lo que haya en el dashboard. **No le pongas un `value:` nunca.**

### Plan B, listo y verificado: mudarse de host

**No está en uso, y a propósito.** Cuando el arranque lento se volvió
intolerable (2026-10) la salida elegida fue subir a `starter` en Render, no
mudarse — porque mudarse cambia la URL, y la app está instalada como PWA en
los celulares de los líderes: cada uno tendría que desinstalarla y volver a
instalarla. Pagar el plan evita todo eso y resuelve lo mismo.

El `Dockerfile` de la raíz queda para el día que mudarse sí convenga (por
precio, o después de tener dominio propio). Sirve igual para Railway
(~$5/mes), Fly.io (~$2-4/mes) o Cloud Run, y no cambia nada del
comportamiento de la app: corre los mismos dos comandos que Render corre hoy
en su `startCommand` (`alembic upgrade head && uvicorn app.main:app`).

Verificado el 2026-09-19 con el mismo layout de carpetas que arma la imagen:
Alembic aplica las 12 migraciones sobre una base vacía (exit 0) y la app
sirve `/health`, `index.html`, los JS con `?v=5` y el `service-worker.js`
con `cache-control: no-cache`. Los 210 tests siguen pasando.

**La base de datos no se toca:** vive en Supabase, no en Render. Mudarse es
levantar el contenedor en el host nuevo y copiarle las mismas variables de
entorno que hoy están en el dashboard de Render (`DATABASE_URL`,
`SECRET_KEY`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`,
`TELEGRAM_BOT_TOKEN`).

Dos cosas que hay que rehacer después de mudarse, y que es fácil olvidar:

1. **El webhook de Telegram** apunta a la URL vieja. Hay que volver a
   registrarlo contra el dominio nuevo (ver `.env.example` para el comando
   de `setWebhook`), o el bot queda mudo sin dar error.
2. **La PWA ya instalada en los celulares** apunta al dominio viejo. Si la
   URL cambia, cada líder tiene que volver a instalarla — motivo de peso
   para configurar un dominio propio *antes* de mudarse, y así no volver a
   pasar por esto nunca más.

Pendiente, sin bloqueo técnico: dominio propio (Render ya da HTTPS en su
subdominio), copias de seguridad automáticas de Supabase (hoy el respaldo es
manual vía "Exportar a Excel"), paginación en listados si la app crece más
allá de unos cientos de personas.

## Fichas duplicadas

`GET /personas/duplicados` agrupa fichas que podrían ser la misma persona.
Solo detecta y explica el motivo: **fusionar es siempre decisión humana**,
porque dos jóvenes pueden llamarse igual de verdad y juntarlos borraría el
historial de una persona real.

Las reglas se calibraron corriendo el detector sobre los 120 jóvenes reales
(2026-08-24), y la primera versión estaba mal: de 7 grupos, 6 eran personas
distintas. Lo que se corrigió, y por qué cada cosa importa (los nombres de
los ejemplos están cambiados —son menores de edad y esto es un repositorio—
pero conservan la forma del caso real):

- **Se comparan pares, no cadenas.** Con union-find bastaba que A se
  pareciera a B y B a C para meter a A con C. Armaba un grupo de cuatro con
  Ayla Paola Quiroga Mendoza, dos hermanas Salas Peralta y una ficha
  llamada solo "Paola". Ahora un grupo solo se forma si todos sus
  integrantes se parecen entre sí.
- **`token_sort_ratio`, no `token_set_ratio`.** El segundo da 100 cuando un
  nombre está contenido en el otro, así que una ficha cargada solo como
  "Sofia" empataba al 100% con tres Sofías distintas. Sirve para buscar a
  alguien escribiendo medio nombre; no para afirmar que dos fichas son la
  misma persona.
- **Un nombre tiene que contener al otro.** El puntaje solo no alcanza:
  "Santiago Ramirez" vs "Santiago Gomez" da 80 y son distintos; "Maria
  Paula Mendez" vs "...Mendez Navarro" da 81.8 y es la misma. 1.8 puntos no
  sirven como corte, pero la forma sí: en un caso falta un apellido, en el
  otro los apellidos se contradicen.
- **Mismo teléfono no basta.** En una familia se comparte el celular: las
  hermanas Zapata Rivas y las Salas Peralta lo comparten y son personas
  distintas. El teléfono repetido afloja la exigencia sobre el nombre, no la
  reemplaza.

Con eso, sobre los mismos 120 jóvenes queda **un solo grupo, y es un
duplicado real**. Cada uno de esos casos tiene su test.

`POST /personas/duplicados/fusionar` mueve asistencia, seguimiento, áreas e
invitaciones de una ficha a otra y archiva la absorbida (`activo=False`) —
nunca borra, y todo queda en Bitácora con un campo `fusionada_en` que dice
a dónde fue. Completa campos vacíos de la ficha que se conserva, pero jamás
pisa un dato que ya tenía. Pantalla: Jóvenes → "Posibles duplicados"
(pedido del usuario, 2026-08-24, tras ver "José Pacheco" cinco veces en la
lista de fichas incompletas).
