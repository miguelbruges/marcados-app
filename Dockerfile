# Imagen única para cualquier host de contenedores (Railway, Fly.io, Cloud
# Run, Koyeb). No está en uso todavía: hoy producción sigue en Render con
# su runtime nativo de Python (ver render.yaml). Existe como plan B listo y
# verificado para el día que se decida salir de la capa gratuita — ver
# README > "Capa gratuita de Render" para por qué esa mudanza es la
# solución de fondo y el pinger solo un parche.
#
# Corre exactamente los mismos dos comandos que Render corre hoy en su
# startCommand, así que mudarse no cambia el comportamiento de la app.
#
# El contexto de build es la RAÍZ del repo, no backend/: la app sirve el
# frontend desde el mismo origen que la API (ver docs/ARQUITECTURA.md), así
# que la imagen necesita las dos carpetas.

# Python 3.11 fijo, no "latest": passlib 1.7.4 importa el módulo `crypt` de
# la stdlib, que Python 3.13 eliminó. Con 3.13 la app no arranca. 3.11 es
# además la versión sobre la que se verificó esta imagen.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Las dependencias van antes que el código: mientras requirements.txt no
# cambie, el host reutiliza esta capa y el despliegue tarda segundos.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

# app/main.py resuelve el frontend como <raíz>/frontend a partir de su
# propia ruta, y acá esa raíz es /app. No mover backend/ ni frontend/ de
# sitio sin revisar esa línea.
EXPOSE 8000
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
