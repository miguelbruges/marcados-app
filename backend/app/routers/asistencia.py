from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Actividad, Asistencia, Evento, Usuario
from app.schemas import AsistenciaCreate, AsistenciaOut, EventoCreate, EventoOut

router = APIRouter(tags=["asistencia"])


@router.post("/eventos", response_model=EventoOut, status_code=201)
def crear_o_reusar_evento(data: EventoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Idempotente: si ya existe un evento para esa actividad+fecha, se reutiliza
    en vez de crear uno duplicado (evita 'Culto Juvenil 25/07' repetido)."""
    if not db.get(Actividad, data.actividad_id):
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    existente = db.scalar(
        select(Evento).where(Evento.actividad_id == data.actividad_id, Evento.fecha == data.fecha)
    )
    if existente:
        return existente

    evento = Evento(**data.model_dump())
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento


@router.get("/eventos", response_model=list[EventoOut])
def listar_eventos(
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(Evento).where(Evento.activo == True)  # noqa: E712
    if desde:
        q = q.where(Evento.fecha >= desde)
    if hasta:
        q = q.where(Evento.fecha <= hasta)
    return db.scalars(q.order_by(Evento.fecha.desc())).all()


@router.post("/asistencia", response_model=AsistenciaOut, status_code=201)
def registrar_asistencia(
    data: AsistenciaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Marca presente a una persona en un evento. Es idempotente: si ya estaba
    registrada para ese evento, devuelve el registro existente en vez de fallar
    o duplicar — un líder puede tocar el mismo nombre dos veces sin problema."""
    existente = db.scalar(
        select(Asistencia).where(
            Asistencia.persona_id == data.persona_id, Asistencia.evento_id == data.evento_id
        )
    )
    if existente:
        return existente

    asistencia = Asistencia(
        persona_id=data.persona_id,
        evento_id=data.evento_id,
        presente=data.presente,
        registrado_por_id=usuario.id,
    )
    db.add(asistencia)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existente = db.scalar(
            select(Asistencia).where(
                Asistencia.persona_id == data.persona_id, Asistencia.evento_id == data.evento_id
            )
        )
        if existente:
            return existente
        raise
    db.refresh(asistencia)
    return asistencia


@router.get("/eventos/{evento_id}/asistencia", response_model=list[AsistenciaOut])
def ver_asistencia_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    if not db.get(Evento, evento_id):
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return db.scalars(select(Asistencia).where(Asistencia.evento_id == evento_id)).all()


@router.delete("/asistencia/{asistencia_id}", status_code=204)
def quitar_asistencia(
    asistencia_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)
):
    """Corrige un toque accidental."""
    registro = db.get(Asistencia, asistencia_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db.delete(registro)
    db.commit()
