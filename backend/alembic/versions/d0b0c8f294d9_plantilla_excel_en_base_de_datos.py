"""plantilla excel en base de datos

Guarda el libro real usado para exportar (sección 16.2 del handoff) en la
base en vez de en el disco del servidor: el disco de Render es efímero
(se borra en cada deploy), así que EXCEL_TEMPLATE_PATH nunca sobrevivía a
un redeploy y "Descargar Excel" quedaba roto hasta que alguien con acceso
técnico volviera a subir el archivo a mano. Ahora se sube una vez desde
Administración y queda guardado permanentemente.

Revision ID: d0b0c8f294d9
Revises: 69eb7f4522b9
Create Date: 2026-08-12 01:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd0b0c8f294d9'
down_revision: Union[str, None] = '69eb7f4522b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plantilla_excel",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre_archivo", sa.String(length=255), nullable=False),
        sa.Column("contenido", sa.LargeBinary(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plantilla_excel")
