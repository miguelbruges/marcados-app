"""invitado_por_id en persona

Revision ID: b25478ad4fdf
Revises: c3a8650c0eeb
Create Date: 2026-08-10 16:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b25478ad4fdf'
down_revision: Union[str, None] = 'c3a8650c0eeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('personas', sa.Column('invitado_por_id', sa.Integer(), nullable=True))
    with op.batch_alter_table('personas') as batch_op:
        batch_op.create_foreign_key(
            'fk_personas_invitado_por_id_personas', 'personas', ['invitado_por_id'], ['id']
        )


def downgrade() -> None:
    with op.batch_alter_table('personas') as batch_op:
        batch_op.drop_constraint('fk_personas_invitado_por_id_personas', type_='foreignkey')
    op.drop_column('personas', 'invitado_por_id')
