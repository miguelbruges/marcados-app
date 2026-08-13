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

    if "personas" in insp.get_table_names():
        columnas = {c["name"] for c in insp.get_columns("personas")}
        if "activo_ministerio" not in columnas:
            with engine.begin() as conn:
                valor_default = "false" if es_postgres else "0"
                conn.execute(
                    text(f"ALTER TABLE personas ADD COLUMN activo_ministerio BOOLEAN NOT NULL DEFAULT {valor_default}")
                )

        # Reinicio de servidor/bautizado a False para todas las personas
        # (pedido del usuario, 2026-08-13 — ver migración 7b8b896aedf6). Se
        # confirmó con el usuario antes de aplicarlo. Igual que con
        # cuenta_para_semaforo, no hay garantía de que Alembic haya llegado
        # a correr en este despliegue, así que se auto-aplica acá.
        # `alembic_version` es la marca de que ya corrió — sin ella, un
        # reinicio del servidor (Render duerme y despierta seguido en la
        # capa gratuita) volvería a poner todo en False una y otra vez,
        # borrando cualquier corrección manual que el liderazgo ya haya
        # hecho desde la ficha.
        REVISION_RESET_SERVIDOR_BAUTIZADO = "7b8b896aedf6"
        version_actual = None
        if "alembic_version" in insp.get_table_names():
            with engine.begin() as conn:
                version_actual = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if version_actual != REVISION_RESET_SERVIDOR_BAUTIZADO:
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE personas SET servidor = :f, bautizado = :f"),
                    {"f": False if es_postgres else 0},
                )
                if "alembic_version" not in insp.get_table_names():
                    conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
                    conn.execute(
                        text("INSERT INTO alembic_version (version_num) VALUES (:v)"),
                        {"v": REVISION_RESET_SERVIDOR_BAUTIZADO},
                    )
                else:
                    conn.execute(
                        text("UPDATE alembic_version SET version_num = :v"),
                        {"v": REVISION_RESET_SERVIDOR_BAUTIZADO},
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

    if "usuarios" in insp.get_table_names() and "telegram_sesiones" not in insp.get_table_names():
        with engine.begin() as conn:
            if es_postgres:
                conn.execute(
                    text(
                        """
                        CREATE TABLE telegram_sesiones (
                            id SERIAL PRIMARY KEY,
                            chat_id VARCHAR(64) NOT NULL UNIQUE,
                            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
                            creado_en TIMESTAMP NOT NULL
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE telegram_sesiones (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            chat_id VARCHAR(64) NOT NULL UNIQUE,
                            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
                            creado_en DATETIME NOT NULL
                        )
                        """
                    )
                )
