from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Usuario
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Usuario:
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credenciales_invalidas
    payload = decode_access_token(token)
    if not payload:
        raise credenciales_invalidas
    usuario = db.query(Usuario).filter(Usuario.email == payload.get("sub")).first()
    if not usuario or not usuario.activo:
        raise credenciales_invalidas
    return usuario


def require_admin(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    if usuario.rol != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere rol admin")
    return usuario


# Política de acceso acordada con el usuario (2026-08-10): admin, líderes y
# encargados de área (hoy solo la Encargada de Consolidación tiene cuenta)
# ven todo, incluido el seguimiento pastoral y el semáforo de asistencia.
# El resto del equipo de consolidación ve la ficha general de cada joven,
# pero NO el seguimiento pastoral ni el semáforo — son datos de menores de
# edad, mínimo acceso necesario por rol (sección 20 del handoff).
ROLES_CON_ACCESO_PASTORAL = {"admin", "lider", "encargado"}


def require_acceso_pastoral(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    if usuario.rol not in ROLES_CON_ACCESO_PASTORAL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta información (seguimiento pastoral / semáforo de asistencia) es solo para líderes y encargados",
        )
    return usuario
