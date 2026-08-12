from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_acceso_pastoral
from app.models import Persona, Seguimiento, Usuario
from app.schemas import SeguimientoCreate, SeguimientoOut

router = APIRouter(prefix="/seguimiento", tags=["seguimiento"])


@router.post("", response_model=SeguimientoOut, status_code=201)
def crear_seguimiento(
    data: SeguimientoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_acceso_pastoral),
):
    """Solo admin/líder/encargado — seguimiento pastoral, no lo ve todo el
    equipo de consolidación (sección 20 del handoff)."""
    if not db.get(Persona, data.persona_id):
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    campos = data.model_dump()
    campos["fecha"] = campos["fecha"] or date.today()
    registro = Seguimiento(**campos, autor_id=usuario.id)
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return registro


@router.get("/persona/{persona_id}", response_model=list[SeguimientoOut])
def historial_persona(persona_id: int, db: Session = Depends(get_db), _=Depends(require_acceso_pastoral)):
    return db.scalars(
        select(Seguimiento).where(Seguimiento.persona_id == persona_id).order_by(Seguimiento.fecha.desc())
    ).all()
