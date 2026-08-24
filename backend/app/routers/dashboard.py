from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_acceso_pastoral
from app.models import Persona
from app.schemas import PersonaResumen
from app.services.alertas_asistencia import personas_por_nivel, resumen_niveles

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Panel mínimo: conteos simples. Nada de semáforo agregado ni conclusiones
    espirituales calculadas — eso lo decide una persona, no este endpoint."""
    total = db.scalar(select(func.count()).select_from(Persona)) or 0
    # Sobre `estado` (catálogo Activo/Inactivo/Fluctúa), no el `activo` de
    # la ficha (existe/archivada) — ver comentario en el modelo.
    activos = db.scalar(select(func.count()).select_from(Persona).where(Persona.estado == "Activo")) or 0
    bautizados = db.scalar(select(func.count()).select_from(Persona).where(Persona.bautizado == True)) or 0  # noqa: E712
    sirviendo = db.scalar(select(func.count(func.distinct(Persona.id))).select_from(Persona).where(Persona.servidor == True)) or 0  # noqa: E712

    # Sin "asistieron últimos 30 días": era una tarjeta más del panel que no
    # le servía a nadie para decidir nada (pedido del usuario, 2026-08-24) —
    # el semáforo ya cubre la lectura de asistencia, y con más contexto.
    return {
        "total_jovenes": total,
        "activos": activos,
        "bautizados": bautizados,
        "sirviendo": sirviendo,
    }


@router.get("/alertas-resumen")
def alertas_resumen(
    ventana_dias: int | None = Query(default=None, ge=1, le=365, description="Por defecto, el de configuración (30)"),
    db: Session = Depends(get_db),
    _=Depends(require_acceso_pastoral),
):
    """Cuántas personas activas caen en cada nivel del semáforo OPERATIVO de
    asistencia (sección 15/21 del handoff). Alerta operativa, no espiritual
    — el detalle por persona está en GET /personas/{id}/alertas. Solo
    admin/líder/encargado, como el resto de lo pastoral. El período es
    configurable por pedido del usuario — no tiene por qué ser siempre 30
    días."""
    return resumen_niveles(db, ventana_dias=ventana_dias)


@router.get("/alertas-detalle", response_model=list[PersonaResumen])
def alertas_detalle(
    nivel: str = Query(..., pattern="^(verde|amarillo|rojo|sin_datos)$"),
    ventana_dias: int | None = Query(default=None, ge=1, le=365),
    db: Session = Depends(get_db),
    _=Depends(require_acceso_pastoral),
):
    """Lista de personas detrás de una pastilla del semáforo — para poder
    tocarla y ver quiénes son, no solo cuántos."""
    return personas_por_nivel(db, nivel, ventana_dias=ventana_dias)
