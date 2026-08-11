"""limpiar y renombrar actividades (datos, no esquema)

Corrige el catálogo real de Actividad en producción, pedido explícito del
usuario (2026-08-11):
  - 'Culto Juvenil' era un dato de prueba de antes de la migración real
    (id=1, nunca limpiado) que el frontend mostraba hardcodeado en vez de
    leer las actividades reales — se desactiva, no se borra, porque puede
    tener asistencias de prueba ya asociadas.
  - Se renombran las actividades reales a nombres más simples.
  - 'Domingo - Escuela Dominical' se separa en dos turnos.
Todo con UPDATE/INSERT condicionales — no falla ni duplica si ya se corrió,
ni si esos nombres no existían (p.ej. una base de desarrollo nueva).

Revision ID: 78e9da52ef7e
Revises: b25478ad4fdf
Create Date: 2026-08-11 01:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '78e9da52ef7e'
down_revision: Union[str, None] = 'b25478ad4fdf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RENOMBRES = [
    ("Sábado - Encuentro Marcados", "Encuentro Marcados"),
    ("Martes - Escuela de Servidores", "Escuela de Servidores"),
    ("Domingo - Escuela Dominical", "1er Escuela Dominical"),
    ("Otro / Evento esporádico", "Otro"),
]


def upgrade() -> None:
    conn = op.get_bind()
    actividades = sa.table(
        "actividades",
        sa.column("id", sa.Integer),
        sa.column("nombre", sa.String),
        sa.column("tipo", sa.String),
        sa.column("activo", sa.Boolean),
    )

    for nombre_viejo, nombre_nuevo in RENOMBRES:
        ya_existe_nuevo = conn.execute(
            sa.select(actividades.c.id).where(actividades.c.nombre == nombre_nuevo)
        ).first()
        if ya_existe_nuevo:
            continue
        conn.execute(
            actividades.update().where(actividades.c.nombre == nombre_viejo).values(nombre=nombre_nuevo)
        )

    ya_existe_2do_turno = conn.execute(
        sa.select(actividades.c.id).where(actividades.c.nombre == "2da Escuela Dominical")
    ).first()
    if not ya_existe_2do_turno:
        conn.execute(actividades.insert().values(nombre="2da Escuela Dominical", tipo=None, activo=True))

    conn.execute(
        actividades.update().where(actividades.c.nombre == "Culto Juvenil").values(activo=False)
    )


def downgrade() -> None:
    # Es una limpieza de datos de producción, deliberadamente sin retroceso
    # automático — revertir un rename de actividades ya usadas por eventos
    # reales es una decisión humana, no algo para deshacer con un comando.
    pass
