from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.routers import asistencia, auth, catalogos, dashboard, personas, seguimiento
from app.services.bootstrap import bootstrap_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En desarrollo, create_all es suficiente. En producción el esquema se
    # gestiona con Alembic (ver backend/alembic/), nunca con create_all.
    if settings.environment == "development":
        Base.metadata.create_all(bind=engine)

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

app.include_router(auth.router)
app.include_router(personas.router)
app.include_router(asistencia.router)
app.include_router(catalogos.router)
app.include_router(dashboard.router)
app.include_router(seguimiento.router)


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
