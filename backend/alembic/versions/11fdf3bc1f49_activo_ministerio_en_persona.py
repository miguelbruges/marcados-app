"""activo_ministerio en persona

Separa "la ficha existe" (columna `activo`, ya usada como filtro por
defecto de la lista de personas) de "el joven sigue activo en el
ministerio" — que el Panel mostraba como "Activos" leyendo por error la
columna `activo`, así que daba 120/120 siempre, sin distinción real
(pedido del usuario, 2026-08-13: "no todos son activos").

Columna nueva, arranca en False para todas las personas existentes — el
liderazgo la va marcando persona por persona a medida que confirma quién
sigue participando. Nunca se calcula sola todavía (a futuro, en base a
asistencia + si es servidor activo).

Revision ID: 11fdf3bc1f49
Revises: 6a297c928311
Create Date: 2026-08-13 19:56:35.506635
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '11fdf3bc1f49'
down_revision: Union[str, None] = '6a297c928311'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columnas = {c["name"] for c in insp.get_columns("personas")}
    if "activo_ministerio" not in columnas:
        # Idempotente a propósito: puede que la red de seguridad de arranque
        # (app/services/schema_guard.py) ya la haya agregado si esta
        # migración no llegó a correr en un despliegue anterior.
        op.add_column(
            "personas",
            sa.Column("activo_ministerio", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("personas", "activo_ministerio")
