# MARCADOS

Sistema de gestión de jóvenes, asistencia y seguimiento — ministerio MARCADOS
(iglesia Fuente de Vida, Santa Marta). Reemplaza progresivamente al Excel
maestro, que queda como fuente histórica congelada.

## Estado

MVP funcional: login, alta de jóvenes, registro de asistencia con matching
difuso de nombres, panel básico. Ver `docs/ARQUITECTURA.md` para decisiones
de diseño y `docs/ESTADO.md` para el checklist de avance.

**No incluido todavía:** datos reales (el Excel baseline no está disponible
en este entorno — ver sección "Migración" abajo), WhatsApp, reportes
avanzados, base de datos persistente en producción.

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

Tests: `pytest tests/ -v` (39 tests: matching, auth, personas, asistencia,
importación de listas, bootstrap de admin).

### Migraciones (Alembic)

En desarrollo, `create_all` basta (se ejecuta solo al levantar la app). En
producción el esquema se gestiona con Alembic:

```bash
alembic upgrade head                              # aplicar
alembic revision --autogenerate -m "descripción"  # nueva migración
```

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

## Ficha completa y fichas incompletas

Cada persona expone `ficha_completa_pct` y `datos_faltantes`, calculados
sobre los 14 campos clave de la sección 17 del handoff (nunca se guardan:
se recalculan al vuelo). `GET /personas/fichas-incompletas` devuelve las
fichas por debajo del umbral configurado (`FICHA_COMPLETA_UMBRAL_PORCENTAJE`,
70% por defecto) — nunca bloquea el registro de nadie, es solo información
operativa para priorizar seguimiento.

## Exportar a Excel (plantilla real)

`GET /export/excel` (solo admin) genera un `.xlsx` idéntico en diseño al
libro real: usa el archivo real como plantilla (`openpyxl.load_workbook`,
sin tocar fórmulas, catálogos ni formato), solo reemplaza las filas de datos
de Jóvenes y Asistencia, y ajusta el rango de cada tabla al número real de
filas. Requiere `EXCEL_TEMPLATE_PATH` apuntando a una copia del archivo real
en el servidor (nunca en el repo — ver abajo). Seguimiento y Servicio
todavía no se exportan: sus columnas no tienen un mapeo exacto ya poblado en
el modelo actual, y no se quiso inventar uno.

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

## Desplegar para probar desde el celular (un solo servicio: Render)

FastAPI sirve el frontend directamente (mismo origen que la API) — no hace
falta GitHub Pages ni ningún segundo servicio. Esto también evita problemas
de CORS entre sitios distintos, que algunas redes móviles bloquean de formas
difíciles de diagnosticar a distancia.

Paso manual — requiere tu cuenta, no se puede hacer desde el asistente:

1. En https://render.com: **New > Blueprint**, conectar este repo. Render lee
   `render.yaml` y propone el servicio `marcados-api` solo.
2. Antes de aplicar, completar las variables marcadas como manuales:
   - `CORS_ORIGINS`: podés dejarla vacía o con cualquier valor — ya no es
     necesaria para el uso normal de la app (mismo origen), solo importaría
     si en el futuro otro sitio distinto necesita llamar a la API.
   - `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`: con qué usuario vas
     a entrar la primera vez (se crea/actualiza solo al arrancar).
   - `SECRET_KEY` se genera sola.
3. Deploy. La URL que te da Render (`https://marcados-app.onrender.com` o
   similar) **es la app entera** — abrila desde el celular y listo.

**Importante — capa gratuita de Render:** el disco es efímero. Sirve para
comprobar que la app funciona desde un celular real, pero los datos pueden
perderse si el servicio se reinicia por inactividad. No cargar datos reales
de jóvenes ahí todavía — eso espera a la decisión de Postgres/Supabase.

## Producción real (pendiente, requiere más decisiones del usuario)

- Base de datos persistente: Postgres/Supabase (`DATABASE_URL` ya es
  intercambiable, ver arriba).
- Dominio propio y HTTPS (Render y GitHub Pages ya dan HTTPS por defecto en
  sus subdominios).
- Integración WhatsApp Business API (solo canal de entrada adicional, nunca
  el núcleo del sistema).
