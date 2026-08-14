"""quitar activo_ministerio, usar estado

Pedido del usuario, 2026-08-14: ya existía `estado` (catálogo
Activo/Inactivo/Fluctúa, migrado del Excel original) cubriendo exactamente
el mismo criterio que `activo_ministerio` (agregada en 11fdf3bc1f49) — dos
lugares distintos para marcar lo mismo era confuso y redundante. El Panel
ahora cuenta "Activos" sobre estado == "Activo" directamente.

Revision ID: 64ebe67f6c06
Revises: 7b8b896aedf6
Create Date: 2026-08-14 22:25:23.556300
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '64ebe67f6c06'
down_revision: Union[str, None] = '7b8b896aedf6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columnas = {c["name"] for c in insp.get_columns("personas")}
    if "activo_ministerio" in columnas:
        # Idempotente a propósito: puede que la red de seguridad de
        # arranque (app/services/schema_guard.py) ya la haya quitado.
        op.drop_column("personas", "activo_ministerio")


def downgrade() -> None:
    op.add_column(
        "personas",
        sa.Column("activo_ministerio", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
