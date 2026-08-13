from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_acceso_pastoral
from app.models import Asistencia, Evento, Persona
from app.schemas import PersonaResumen
from app.services.alertas_asistencia import personas_por_nivel, resumen_niveles

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Panel mínimo: conteos simples. Nada de semáforo agregado ni conclusiones
    espirituales calculadas — eso lo decide una persona, no este endpoint."""
    total = db.scalar(select(func.count()).select_from(Persona)) or 0
    # activo_ministerio, no el `activo` de la ficha (existe/archivada) — ver
    # comentario en el modelo. Es manual y arranca en False para todos.
    activos = db.scalar(select(func.count()).select_from(Persona).where(Persona.activo_ministerio == True)) or 0  # noqa: E712
    bautizados = db.scalar(select(func.count()).select_from(Persona).where(Persona.bautizado == True)) or 0  # noqa: E712
    sirviendo = db.scalar(select(func.count(func.distinct(Persona.id))).select_from(Persona).where(Persona.servidor == True)) or 0  # noqa: E712

    hace_30 = date.today() - timedelta(days=30)
    asistieron_30d = db.scalar(
        select(func.count(func.distinct(Asistencia.persona_id)))
        .select_from(Asistencia)
        .join(Evento, Evento.id == Asistencia.evento_id)
        .where(Evento.fecha >= hace_30, Asistencia.presente == True)  # noqa: E712
    ) or 0

    return {
        "total_jovenes": total,
        "activos": activos,
        "bautizados": bautizados,
        "sirviendo": sirviendo,
        "asistieron_ultimos_30_dias": asistieron_30d,
    }


@router.get("/asistieron-30-dias", response_model=list[PersonaResumen])
def asistieron_30_dias(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Lista de personas detrás del conteo 'asistieron_ultimos_30_dias' de
    /dashboard/resumen — mismo filtro exacto, para que la tarjeta del panel
    se pueda abrir y mostrar quiénes son, no solo cuántos."""
    hace_30 = date.today() - timedelta(days=30)
    return db.scalars(
        select(Persona)
        .join(Asistencia, Asistencia.persona_id == Persona.id)
        .join(Evento, Evento.id == Asistencia.evento_id)
        .where(Evento.fecha >= hace_30, Asistencia.presente == True)  # noqa: E712
        .distinct()
        .order_by(Persona.apellidos, Persona.nombres)
    ).all()


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
