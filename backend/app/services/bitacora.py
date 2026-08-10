"""Registro de auditoría: quién cambió qué campo, con qué valor, cuándo."""

from sqlalchemy.orm import Session

from app.models import Bitacora


def registrar_cambios(
    db: Session,
    *,
    tabla: str,
    registro_id: int,
    usuario_id: int | None,
    cambios: dict[str, tuple[object, object]],
) -> None:
    """cambios: {campo: (valor_anterior, valor_nuevo)}. Solo escribe una fila
    por campo que realmente cambió — comparar antes de llamar, esta función
    no filtra por vos."""
    for campo, (anterior, nuevo) in cambios.items():
        db.add(
            Bitacora(
                tabla=tabla,
                registro_id=registro_id,
                campo=campo,
                valor_anterior=None if anterior is None else str(anterior),
                valor_nuevo=None if nuevo is None else str(nuevo),
                usuario_id=usuario_id,
            )
        )
