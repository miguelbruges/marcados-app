"""cuenta_para_semaforo en actividad

Corrige el semáforo de asistencia (pedido del usuario, 2026-08-12): antes el
denominador era "cuántas veces esta persona quedó registrada", así que una
sola asistencia aislada daba 100% / verde sin significar nada confiable. El
denominador correcto es "cuántas reuniones hubo" — pero no toda actividad
debe contar: Escuela de Servidores, por ejemplo, no aplica a quien no sirve,
y penalizaría injustamente su semáforo.

Este campo marca qué actividades sí cuentan como "oportunidad de
asistencia". Por defecto, solo el encuentro semanal principal (Encuentro
Marcados) — las demás quedan en False. Editable después por un admin vía
PATCH /actividades/{id} si el liderazgo decide otra cosa.

Revision ID: 69eb7f4522b9
Revises: 78e9da52ef7e
Create Date: 2026-08-12 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '69eb7f4522b9'
down_revision: Union[str, None] = '78e9da52ef7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "actividades",
        sa.Column("cuenta_para_semaforo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    conn = op.get_bind()
    actividades = sa.table(
        "actividades",
        sa.column("nombre", sa.String),
        sa.column("cuenta_para_semaforo", sa.Boolean),
    )
    conn.execute(
        actividades.update()
        .where(actividades.c.nombre != "Encuentro Marcados")
        .values(cuenta_para_semaforo=False)
    )


def downgrade() -> None:
    op.drop_column("actividades", "cuenta_para_semaforo")
