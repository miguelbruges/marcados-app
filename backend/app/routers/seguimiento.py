from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Persona, Seguimiento, Usuario
from app.schemas import SeguimientoCreate, SeguimientoOut

router = APIRouter(prefix="/seguimiento", tags=["seguimiento"])


@router.post("", response_model=SeguimientoOut, status_code=201)
def crear_seguimiento(
    data: SeguimientoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    if not db.get(Persona, data.persona_id):
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    registro = Seguimiento(**data.model_dump(), autor_id=usuario.id)
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return registro


@router.get("/persona/{persona_id}", response_model=list[SeguimientoOut])
def historial_persona(persona_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.scalars(
        select(Seguimiento).where(Seguimiento.persona_id == persona_id).order_by(Seguimiento.fecha.desc())
    ).all()
