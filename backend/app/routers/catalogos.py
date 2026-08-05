from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import AreaServicio, Catalogo
from app.schemas import AreaServicioOut, CatalogoOut

router = APIRouter(tags=["catalogos"])


@router.get("/catalogos/{tipo}", response_model=list[CatalogoOut])
def listar_catalogo(tipo: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.scalars(
        select(Catalogo).where(Catalogo.tipo == tipo, Catalogo.activo == True)  # noqa: E712
    ).all()


@router.get("/areas-servicio", response_model=list[AreaServicioOut])
def listar_areas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.scalars(select(AreaServicio).where(AreaServicio.activo == True)).all()  # noqa: E712
