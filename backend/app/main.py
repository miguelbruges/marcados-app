from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import asistencia, auth, catalogos, dashboard, personas, seguimiento


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En desarrollo, create_all es suficiente. En producción el esquema se
    # gestiona con Alembic (ver backend/alembic/), nunca con create_all.
    if settings.environment == "development":
        Base.metadata.create_all(bind=engine)
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
