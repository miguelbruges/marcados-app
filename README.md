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

## Migración desde el Excel

`backend/migration/import_excel.py` es la plantilla de migración — **no se
ha ejecutado contra el archivo real** porque el baseline actual no está
disponible en este entorno de desarrollo. Antes de correrla:

1. Confirmar cuál es el Excel baseline vigente.
2. `python -m migration.import_excel --excel /ruta/al/baseline.xlsx --dry-run`
   y revisar el reporte (incluye posibles duplicados detectados, que nunca
   se fusionan automáticamente).
3. Recién entonces correr sin `--dry-run`.

## Seguridad y datos personales

- El Excel y cualquier base de datos con información real **nunca** se suben
  al repositorio — ver `.gitignore` (bloquea `*.xlsx`, `*.db`, `.env`, etc.).
- Autenticación JWT, contraseñas con bcrypt, CORS restringido por variable
  de entorno, roles admin/líder.
- El semáforo espiritual y cualquier conclusión de seguimiento pastoral son
  siempre decisión humana — el sistema nunca las calcula automáticamente.

## Desplegar para probar desde el celular (Render + GitHub Pages)

Pasos manuales — requieren tus cuentas, no se pueden hacer desde el asistente:

**1. Backend en Render**
1. En https://render.com: **New > Blueprint**, conectar este repo. Render lee
   `render.yaml` y propone el servicio `marcados-api` solo.
2. Antes de aplicar, completar las variables marcadas como manuales:
   - `CORS_ORIGINS`: la URL que te va a dar GitHub Pages, ej.
     `https://tu-usuario.github.io` (se puede completar después y redeploy).
   - `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`: con qué usuario vas
     a entrar la primera vez (se crea solo al arrancar).
   - `SECRET_KEY` se genera sola.
3. Deploy. Copiar la URL pública que te da Render (`https://marcados-api-xxxx.onrender.com`).

**2. Frontend en GitHub Pages**
1. En GitHub: **Settings > Pages > Source > GitHub Actions** (una sola vez).
2. **Settings > Secrets and variables > Actions > Variables**: crear la
   variable `MARCADOS_API_URL` con la URL de Render del paso anterior.
3. Cualquier push a `master` que toque `frontend/` dispara el workflow
   `.github/workflows/deploy-pages.yml` y publica el sitio solo.

**3. Ajustar CORS**
Volver a Render y actualizar `CORS_ORIGINS` con la URL real que te dio
GitHub Pages, si no la sabías en el paso 1.

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
