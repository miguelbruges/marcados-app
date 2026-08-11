from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.matching import buscar_candidatos
from app.models import Actividad, Asistencia, Evento, Persona, Usuario
from app.schemas import (
    ActividadCreate,
    ActividadOut,
    ActividadUpdate,
    AsistenciaCreate,
    AsistenciaOut,
    EventoCreate,
    EventoOut,
    ImportarConfirmarRequest,
    ImportarConfirmarResponse,
    ImportarFilaOut,
    ImportarPreviewRequest,
    ImportarPreviewResponse,
)
from app.services.importador import parsear_lista

router = APIRouter(tags=["asistencia"])


@router.get("/actividades", response_model=list[ActividadOut])
def listar_actividades(
    activo: bool | None = Query(default=True),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Alimenta los desplegables de 'Actividad' en Asistencia/Importar —
    antes esa lista estaba escrita a mano en el frontend ('Culto Juvenil'),
    sin relación con las actividades reales de la base de datos."""
    q = select(Actividad)
    if activo is not None:
        q = q.where(Actividad.activo == activo)
    return db.scalars(q.order_by(Actividad.nombre)).all()


@router.post("/actividades", response_model=ActividadOut, status_code=201)
def crear_actividad(data: ActividadCreate, db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)):
    if db.query(Actividad).filter(Actividad.nombre == data.nombre).first():
        raise HTTPException(status_code=409, detail="Ya existe una actividad con ese nombre")
    actividad = Actividad(nombre=data.nombre, tipo=data.tipo)
    db.add(actividad)
    db.commit()
    db.refresh(actividad)
    return actividad


@router.patch("/actividades/{actividad_id}", response_model=ActividadOut)
def editar_actividad(
    actividad_id: int, data: ActividadUpdate, db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)
):
    """Admin-only: renombrar o desactivar una actividad (nunca se borra —
    quedaría huérfano el historial de eventos/asistencia que la usan)."""
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(actividad, campo, valor)
    db.commit()
    db.refresh(actividad)
    return actividad


def _obtener_o_crear_evento(db: Session, actividad_id: int, fecha: date, nombre: str) -> Evento:
    if not db.get(Actividad, actividad_id):
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    existente = db.scalar(select(Evento).where(Evento.actividad_id == actividad_id, Evento.fecha == fecha))
    if existente:
        return existente
    evento = Evento(actividad_id=actividad_id, fecha=fecha, nombre=nombre)
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento


def _registrar_idempotente(db: Session, persona_id: int, evento_id: int, usuario_id: int | None) -> tuple[Asistencia, bool]:
    """Devuelve (registro, creado_ahora). Nunca duplica ni falla si ya existía."""
    existente = db.scalar(
        select(Asistencia).where(Asistencia.persona_id == persona_id, Asistencia.evento_id == evento_id)
    )
    if existente:
        return existente, False

    asistencia = Asistencia(persona_id=persona_id, evento_id=evento_id, registrado_por_id=usuario_id)
    db.add(asistencia)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existente = db.scalar(
            select(Asistencia).where(Asistencia.persona_id == persona_id, Asistencia.evento_id == evento_id)
        )
        if existente:
            return existente, False
        raise
    db.refresh(asistencia)
    return asistencia, True


@router.post("/eventos", response_model=EventoOut, status_code=201)
def crear_o_reusar_evento(data: EventoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Idempotente: si ya existe un evento para esa actividad+fecha, se reutiliza
    en vez de crear uno duplicado (evita 'Culto Juvenil 25/07' repetido)."""
    return _obtener_o_crear_evento(db, data.actividad_id, data.fecha, data.nombre)


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
    asistencia, _creado = _registrar_idempotente(db, data.persona_id, data.evento_id, usuario.id)
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


@router.post("/asistencia/importar/preview", response_model=ImportarPreviewResponse)
def importar_preview(
    data: ImportarPreviewRequest,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Pega texto tipo WhatsApp, lo separa en nombres y corre matching por cada
    uno. NO guarda nada — es solo la vista previa que el líder confirma antes
    de guardar. El evento sí se crea/reutiliza aquí porque es idempotente y
    hace falta su id para el paso de confirmación."""
    evento = _obtener_o_crear_evento(db, data.actividad_id, data.fecha, data.nombre_evento or f"{data.fecha}")

    personas = db.execute(
        select(Persona.id, Persona.id_unico, Persona.nombres, Persona.apellidos).where(Persona.activo == True)  # noqa: E712
    ).all()
    tuplas = [(pid, id_unico, f"{nombres} {apellidos}") for pid, id_unico, nombres, apellidos in personas]

    filas = []
    for nombre in parsear_lista(data.texto):
        resultado = buscar_candidatos(nombre, tuplas)
        filas.append(
            ImportarFilaOut(
                texto_original=nombre,
                confianza=resultado.confianza.value,
                candidatos=[c.__dict__ for c in resultado.candidatos],
            )
        )

    return ImportarPreviewResponse(evento=evento, filas=filas)


@router.post("/asistencia/importar/confirmar", response_model=ImportarConfirmarResponse)
def importar_confirmar(
    data: ImportarConfirmarRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Guarda asistencia para las personas que el líder confirmó manualmente
    en la vista previa. Cada una pasa por el mismo camino idempotente que el
    registro uno-por-uno — nunca duplica."""
    if not db.get(Evento, data.evento_id):
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    guardados = 0
    ya_registrados = 0
    for persona_id in set(data.persona_ids):
        if not db.get(Persona, persona_id):
            raise HTTPException(status_code=404, detail=f"Persona {persona_id} no encontrada")
        _registro, creado = _registrar_idempotente(db, persona_id, data.evento_id, usuario.id)
        if creado:
            guardados += 1
        else:
            ya_registrados += 1

    return ImportarConfirmarResponse(guardados=guardados, ya_registrados=ya_registrados)
