"""Datos mínimos para desarrollo local: un usuario admin y la actividad base.

No es un fixture de producción — solo para poder probar el flujo completo
(login -> asistencia -> panel) en una base de datos vacía.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine
from app.models import Actividad, RolUsuario, Usuario
from app.security import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()
try:
    if not db.query(Usuario).filter(Usuario.email == "admin@marcadosapp.dev").first():
        db.add(
            Usuario(
                nombre="Admin",
                email="admin@marcadosapp.dev",
                password_hash=hash_password("admin1234"),
                rol=RolUsuario.ADMIN,
            )
        )
    if not db.query(Actividad).filter(Actividad.nombre == "Culto Juvenil").first():
        db.add(Actividad(nombre="Culto Juvenil", tipo="culto"))
    db.commit()
    print("Seed listo: admin@marcadosapp.dev / admin1234")
finally:
    db.close()
