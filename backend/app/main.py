from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.routers import asistencia, auth, catalogos, dashboard, exportar, migracion, personas, seguimiento, telegram, usuarios
from app.services.bootstrap import bootstrap_admin
from app.services.schema_guard import asegurar_esquema_minimo


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En desarrollo, create_all es suficiente. En producción el esquema se
    # gestiona con Alembic (ver backend/alembic/), nunca con create_all.
    if settings.environment == "development":
        Base.metadata.create_all(bind=engine)

    # Red de seguridad además de (no en vez de) Alembic — ver
    # app/services/schema_guard.py para el contexto de por qué hace falta.
    asegurar_esquema_minimo(engine)

    db = SessionLocal()
    try:
        bootstrap_admin(db)
    finally:
        db.close()

    yield


app = FastAPI(title="MARCADOS API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# El navegador solo detecta que hay un service worker nuevo si compara bytes
# frescos de /service-worker.js — si el propio navegador (o un proxy/CDN
# delante) lo sirve desde su caché HTTP, la comparación siempre da "igual"
# y la actualización nunca se dispara, sin importar cuántas veces se
# redespliegue el backend. Mismo problema con index.html: es el punto de
# entrada de la SPA, tiene que revalidarse siempre. Esto es justamente lo
# que causó que la app se quedara mostrando una versión vieja en producción
# después de varios despliegues "exitosos".
@app.middleware("http")
async def sin_cache_para_el_shell(request, call_next):
    response = await call_next(request)
    if request.url.path in ("/service-worker.js", "/", "/index.html"):
        response.headers["Cache-Control"] = "no-cache"
    return response

app.include_router(auth.router)
app.include_router(personas.router)
app.include_router(asistencia.router)
app.include_router(catalogos.router)
app.include_router(dashboard.router)
app.include_router(seguimiento.router)
app.include_router(usuarios.router)
app.include_router(exportar.router)
app.include_router(migracion.router)
app.include_router(telegram.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# El frontend se sirve desde este mismo servidor (mismo origen que la API).
# Evita depender de CORS entre dominios distintos — algunas redes móviles
# interfieren con pedidos "cross-origin" de formas difíciles de diagnosticar
# a distancia; same-origin los evita de raíz. Va al final: las rutas de la
# API de arriba tienen prioridad sobre este catch-all de archivos estáticos.
_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if _frontend_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
