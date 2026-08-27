from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_acceso_pastoral
from app.models import Persona, Seguimiento, Usuario
from app.schemas import SeguimientoCreate, SeguimientoOut, SeguimientoRequiereAtencionOut

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


@router.get("/requieren-atencion", response_model=list[SeguimientoRequiereAtencionOut])
def listar_requieren_atencion(db: Session = Depends(get_db), _=Depends(require_acceso_pastoral)):
    """Vista entre personas de los registros marcados 'requiere atención' —
    alimenta el centro de alertas del panel. Sigue siendo una nota humana,
    nunca un cálculo automático (principio no negociable del proyecto)."""
    return db.scalars(
        select(Seguimiento).where(Seguimiento.requiere_atencion == True).order_by(Seguimiento.fecha.desc())  # noqa: E712
    ).all()


@router.patch("/{seguimiento_id}/resolver", response_model=SeguimientoOut)
def resolver_seguimiento(
    seguimiento_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_acceso_pastoral),
):
    """Baja la marca "requiere atención" de un registro ya revisado.

    Faltaba: la marca se podía poner (al crear el seguimiento, o
    automáticamente al importar el Excel) pero NO sacar, así que el centro
    de alertas solo crecía y el contador de la campanita quedó en 99+ con
    cosas ya resueltas hace rato — una lista que no se puede ir tachando no
    sirve para priorizar (reportado por el usuario, 2026-08-24).

    Solo baja la bandera: la nota y su texto quedan intactos en el historial
    de la persona, porque son lo que un humano escribió y no se borra. Queda
    en Bitácora quién la resolvió.
    """
    from app.services.bitacora import registrar_cambios

    registro = db.get(Seguimiento, seguimiento_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Registro de seguimiento no encontrado")
    if not registro.requiere_atencion:
        return registro  # idempotente: resolver dos veces no es un error

    registrar_cambios(
        db,
        tabla="seguimientos",
        registro_id=registro.id,
        usuario_id=usuario.id,
        cambios={"requiere_atencion": (True, False)},
    )
    registro.requiere_atencion = False
    db.commit()
    db.refresh(registro)
    return registro
