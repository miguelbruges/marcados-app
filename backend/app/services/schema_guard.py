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

Para operaciones que no son "crear si falta" (ej. una migración de datos
que solo debe correr una vez, como el reinicio de servidor/bautizado) se
usa `schema_guard_aplicado` como marca — una tabla propia de este archivo,
sin tocar `alembic_version` (que es de Alembic, no de acá).
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _ya_aplicado(conn, clave: str) -> bool:
    conn.execute(text("CREATE TABLE IF NOT EXISTS schema_guard_aplicado (clave VARCHAR(64) PRIMARY KEY)"))
    fila = conn.execute(text("SELECT 1 FROM schema_guard_aplicado WHERE clave = :c"), {"c": clave}).first()
    return fila is not None


def _marcar_aplicado(conn, clave: str) -> None:
    conn.execute(text("INSERT INTO schema_guard_aplicado (clave) VALUES (:c)"), {"c": clave})


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
        if "activo_ministerio" in columnas:
            # Se sacó (pedido del usuario, 2026-08-14): "Estado" ya cubre
            # el mismo criterio (Activo/Inactivo/Fluctúa) — ver migración
            # 64ebe67f6c06.
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE personas DROP COLUMN activo_ministerio"))

        # Reinicio de servidor/bautizado a False para todas las personas,
        # una única vez (pedido del usuario, 2026-08-13 — ver migración
        # 7b8b896aedf6). Se confirmó con el usuario antes de aplicarlo.
        # Repetirlo en cada reinicio del proceso (Render duerme y despierta
        # seguido en la capa gratuita) borraría correcciones manuales ya
        # hechas por el liderazgo, por eso la marca en
        # `schema_guard_aplicado` en vez de repetirlo sin más.
        CLAVE_RESET_SERVIDOR_BAUTIZADO = "reset_servidor_bautizado_2026_08_13"
        with engine.begin() as conn:
            if not _ya_aplicado(conn, CLAVE_RESET_SERVIDOR_BAUTIZADO):
                conn.execute(
                    text("UPDATE personas SET servidor = :f, bautizado = :f"),
                    {"f": False if es_postgres else 0},
                )
                _marcar_aplicado(conn, CLAVE_RESET_SERVIDOR_BAUTIZADO)

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
