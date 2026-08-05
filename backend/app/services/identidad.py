"""Asignación del ID único (MAR-000001, MAR-000002, ...).

Es la identidad técnica real de una persona — nunca el `id` autoincremental
de la fila ni un "No." de posición. El contador es simplemente "el mayor
número usado hasta ahora + 1"; no requiere una tabla de secuencia aparte
porque `id_unico` ya es una columna indexada y única.
"""

import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Persona

PREFIJO = "MAR-"
ANCHO = 6


def siguiente_id_unico(db: Session) -> str:
    ultimo = db.scalar(select(func.max(Persona.id_unico)))
    if not ultimo:
        return f"{PREFIJO}{1:0{ANCHO}d}"
    match = re.match(rf"{re.escape(PREFIJO)}(\d+)", ultimo)
    numero = int(match.group(1)) + 1 if match else 1
    return f"{PREFIJO}{numero:0{ANCHO}d}"
