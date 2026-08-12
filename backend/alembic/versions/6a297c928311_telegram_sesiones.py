"""telegram sesiones

Tabla para el bot de Telegram de solo consulta (sección 19 del handoff,
último pendiente): vincula un chat_id de Telegram con un Usuario ya
existente tras /login dentro del bot. El bot nunca crea usuarios ni
credenciales propias — reusa exactamente el mismo rol/permisos que esa
persona ya tiene en la app.

Revision ID: 6a297c928311
Revises: d0b0c8f294d9
Create Date: 2026-08-12 02:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '6a297c928311'
down_revision: Union[str, None] = 'd0b0c8f294d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "telegram_sesiones" not in insp.get_table_names():
        # Idempotente a propósito — ver la nota equivalente en 69eb7f4522b9:
        # una red de seguridad de arranque (app/services/schema_guard.py)
        # puede haber creado esta tabla si esta migración no llegó a correr.
        op.create_table(
            "telegram_sesiones",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("chat_id", sa.String(length=64), nullable=False, unique=True),
            sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
            sa.Column("creado_en", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_telegram_sesiones_chat_id", "telegram_sesiones", ["chat_id"])


def downgrade() -> None:
    op.drop_table("telegram_sesiones")
