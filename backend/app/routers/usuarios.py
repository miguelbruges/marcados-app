from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import RolUsuario, Usuario
from app.schemas import UsuarioCreate, UsuarioOut
from app.security import hash_password

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

ROLES_VALIDOS = {r.value for r in RolUsuario}


@router.get("", response_model=list[UsuarioOut])
def listar_usuarios(db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)):
    """Solo admin — gestión de líderes/consolidación/encargados."""
    return db.scalars(select(Usuario).order_by(Usuario.nombre)).all()


@router.post("", response_model=UsuarioOut, status_code=201)
def crear_usuario(
    data: UsuarioCreate, db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)
):
    if data.rol not in ROLES_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Rol inválido. Válidos: {sorted(ROLES_VALIDOS)}")
    email = data.email.strip().lower()
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")

    usuario = Usuario(
        nombre=data.nombre,
        email=email,
        password_hash=hash_password(data.password),
        rol=RolUsuario(data.rol),
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.patch("/{usuario_id}/desactivar", response_model=UsuarioOut)
def desactivar_usuario(
    usuario_id: int, db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)
):
    """Nunca se borra un usuario (quedaría huérfana su bitácora/asistencias
    registradas) — se desactiva, como con las personas."""
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    usuario.activo = False
    db.commit()
    db.refresh(usuario)
    return usuario
