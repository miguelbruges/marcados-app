from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.matching import buscar_candidatos
from app.models import Persona
from app.schemas import MatchResponse, PersonaCreate, PersonaOut
from app.services.identidad import siguiente_id_unico

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("", response_model=list[PersonaOut])
def listar_personas(
    activo: bool | None = Query(default=True),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(Persona)
    if activo is not None:
        q = q.where(Persona.activo == activo)
    return db.scalars(q.order_by(Persona.apellidos, Persona.nombres)).all()


@router.get("/{persona_id}", response_model=PersonaOut)
def obtener_persona(persona_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    return persona


@router.post("", response_model=PersonaOut, status_code=201)
def crear_persona(data: PersonaCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    persona = Persona(id_unico=siguiente_id_unico(db), **data.model_dump())
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


@router.get("/buscar/coincidencias", response_model=MatchResponse)
def buscar_coincidencias(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Matching difuso para el flujo de asistencia: el líder escribe un nombre
    aproximado y esto devuelve candidatos con su nivel de confianza."""
    personas = db.execute(
        select(Persona.id, Persona.id_unico, Persona.nombres, Persona.apellidos).where(Persona.activo == True)  # noqa: E712
    ).all()
    tuplas = [(pid, id_unico, f"{nombres} {apellidos}") for pid, id_unico, nombres, apellidos in personas]
    resultado = buscar_candidatos(q, tuplas)
    return MatchResponse(
        confianza=resultado.confianza.value,
        candidatos=[c.__dict__ for c in resultado.candidatos],
    )
