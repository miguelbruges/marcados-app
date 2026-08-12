"""Red de seguridad de esquema — NO reemplaza a Alembic, lo complementa.

Contexto (2026-08-12): el Panel y Asistencia quedaron en error 500 en
producción porque la columna `actividades.cuenta_para_semaforo` (agregada
por la migración 69eb7f4522b9) no llegó a existir en la base real, a pesar
de que el resto de la app funcionaba con normalidad — lo que indica que
`alembic upgrade head` no se estaba aplicando de verdad en el despliegue,
sin acceso a los logs de Render desde acá para confirmar la causa exacta.

Esta función corre una vez al arrancar la app (antes de aceptar pedidos) y
garantiza que las piezas de esquema más recientes existan de verdad,
usando SQL directo e idempotente (verifica antes de crear). Las
migraciones de Alembic siguen siendo la fuente de verdad y quedan
actualizadas para no chocar con esto: si Alembic corre después y la
columna/tabla ya existe, no vuelve a intentar crearla.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def asegurar_esquema_minimo(engine: Engine) -> None:
    insp = inspect(engine)
    es_postgres = engine.dialect.name == "postgresql"

    if "actividades" in insp.get_table_names():
        columnas = {c["name"] for c in insp.get_columns("actividades")}
        if "cuenta_para_semaforo" not in columnas:
            with engine.begin() as conn:
                valor_default = "true" if es_postgres else "1"
                conn.execute(
                    text(f"ALTER TABLE actividades ADD COLUMN cuenta_para_semaforo BOOLEAN NOT NULL DEFAULT {valor_default}")
                )
                conn.execute(
                    text("UPDATE actividades SET cuenta_para_semaforo = :valor WHERE nombre <> 'Encuentro Marcados'"),
                    {"valor": False if es_postgres else 0},
                )

    if "plantilla_excel" not in insp.get_table_names():
        with engine.begin() as conn:
            if es_postgres:
                conn.execute(
                    text(
                        """
                        CREATE TABLE plantilla_excel (
                            id SERIAL PRIMARY KEY,
                            nombre_archivo VARCHAR(255) NOT NULL,
                            contenido BYTEA NOT NULL,
                            actualizado_en TIMESTAMP NOT NULL
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE plantilla_excel (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            nombre_archivo VARCHAR(255) NOT NULL,
                            contenido BLOB NOT NULL,
                            actualizado_en DATETIME NOT NULL
                        )
                        """
                    )
                )
