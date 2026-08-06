from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Usuario
from app.schemas import LoginRequest, TokenResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    # El email no debe ser sensible a mayúsculas/minúsculas para el login.
    email = data.email.strip().lower()
    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if not usuario or not usuario.activo or not verify_password(data.password, usuario.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email o contraseña incorrectos")
    token = create_access_token(subject=usuario.email, rol=usuario.rol.value)
    return TokenResponse(access_token=token, rol=usuario.rol.value, nombre=usuario.nombre)


@router.get("/me")
def me(usuario: Usuario = Depends(get_current_user)):
    return {"nombre": usuario.nombre, "email": usuario.email, "rol": usuario.rol.value}
