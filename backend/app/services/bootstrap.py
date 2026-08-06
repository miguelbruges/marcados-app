"""Creación del primer usuario admin en un despliegue nuevo.

En un host como Render (capa gratuita) no hay una forma cómoda de abrir una
shell para correr `scripts/seed_dev.py`. Esto resuelve lo mismo por variables
de entorno: si `ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD` están
seteadas (se cargan una sola vez, a mano, en el dashboard del host — nunca en
el repo) y ese usuario no existe todavía, se crea. Si ya existe, no hace nada.
"""

import os

from sqlalchemy.orm import Session

from app.models import RolUsuario, Usuario
from app.security import hash_password


def bootstrap_admin(db: Session) -> None:
    email = os.getenv("ADMIN_BOOTSTRAP_EMAIL")
    password = os.getenv("ADMIN_BOOTSTRAP_PASSWORD")
    if not email or not password:
        return
    if db.query(Usuario).filter(Usuario.email == email).first():
        return
    db.add(
        Usuario(
            nombre="Admin",
            email=email,
            password_hash=hash_password(password),
            rol=RolUsuario.ADMIN,
        )
    )
    db.commit()
