"""Creación/sincronización del usuario admin en un despliegue nuevo.

En un host como Render (capa gratuita) no hay una forma cómoda de abrir una
shell para correr `scripts/seed_dev.py`. Esto resuelve lo mismo por variables
de entorno: si `ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD` están
seteadas (se cargan a mano en el dashboard del host — nunca en el repo), la
contraseña de ese usuario se sincroniza con la variable en cada arranque. Así,
si se cambia la contraseña en el dashboard, el próximo reinicio la aplica —
no hace falta borrar nada a mano en la base de datos, que no es accesible.
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
    email = email.strip().lower()  # el login compara en minúsculas, ver auth.py

    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if usuario:
        usuario.password_hash = hash_password(password)
        usuario.activo = True
        usuario.rol = RolUsuario.ADMIN
    else:
        db.add(
            Usuario(
                nombre="Admin",
                email=email,
                password_hash=hash_password(password),
                rol=RolUsuario.ADMIN,
            )
        )
    db.commit()
