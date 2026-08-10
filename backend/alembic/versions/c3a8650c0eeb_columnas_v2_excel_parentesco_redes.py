"""columnas v2 excel: parentesco, tiene_instagram, tiene_facebook

Revision ID: c3a8650c0eeb
Revises: 60ec932bd6ef
Create Date: 2026-08-10 08:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3a8650c0eeb'
down_revision: Union[str, None] = '60ec932bd6ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('personas', sa.Column('tiene_instagram', sa.Boolean(), nullable=True))
    op.add_column('personas', sa.Column('tiene_facebook', sa.Boolean(), nullable=True))
    op.add_column('personas', sa.Column('parentesco', sa.String(length=60), nullable=True))


def downgrade() -> None:
    op.drop_column('personas', 'parentesco')
    op.drop_column('personas', 'tiene_facebook')
    op.drop_column('personas', 'tiene_instagram')
