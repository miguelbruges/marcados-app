"""reiniciar servidor y bautizado a false

Reinicio operativo, no un cambio de esquema: los datos de `servidor` y
`bautizado` que llegaron de la migración inicial del Excel quedaron
desactualizados con el tiempo (ej. "sirviendo" marcaba 31 personas cuando
en la realidad son unas 24-25) y nunca se corrigieron uno por uno. Pedido
del usuario, 2026-08-13: "no hay 31 jóvenes sirviendo... Si puedes
colócalo en 0, igualmente los bautizados, y se va actualizando uno por
uno cuando la Encargada vaya actualizando la información."

Esto pone servidor=False y bautizado=False para TODAS las personas
existentes en el momento en que corre esta migración — el liderazgo
vuelve a confirmar cada caso desde la ficha (o el botón "Marcar como
servidor"), igual que ya se hace con `activo_ministerio`. No toca
fecha_bautismo ni fecha_inicio_servicio (quedan como referencia histórica
por si sirven al reconfirmar). El usuario ya tiene el Excel original en
su computador como respaldo si hace falta revisar los valores previos —
por eso no hace falta backup adicional antes de este reinicio.

Revision ID: 7b8b896aedf6
Revises: 11fdf3bc1f49
Create Date: 2026-08-13 20:10:03.233515
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7b8b896aedf6'
down_revision: Union[str, None] = '11fdf3bc1f49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    personas = sa.table(
        "personas",
        sa.column("servidor", sa.Boolean),
        sa.column("bautizado", sa.Boolean),
    )
    conn.execute(personas.update().values(servidor=False, bautizado=False))


def downgrade() -> None:
    # No hay forma de recuperar los valores previos desde acá — este
    # reinicio fue deliberado y sin respaldo automático (ver nota arriba).
    # Si hace falta revertir, es a mano desde el Excel original.
    pass
