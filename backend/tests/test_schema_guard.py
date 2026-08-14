from sqlalchemy import create_engine, inspect, text

from app.services.schema_guard import asegurar_esquema_minimo


def test_agrega_cuenta_para_semaforo_si_falta(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sin_columna.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE actividades (id INTEGER PRIMARY KEY, nombre TEXT, tipo TEXT, activo BOOLEAN)"))
        conn.execute(text("INSERT INTO actividades (nombre, activo) VALUES ('Encuentro Marcados', 1)"))
        conn.execute(text("INSERT INTO actividades (nombre, activo) VALUES ('Otro', 1)"))

    asegurar_esquema_minimo(engine)

    insp = inspect(engine)
    assert "cuenta_para_semaforo" in {c["name"] for c in insp.get_columns("actividades")}

    with engine.connect() as conn:
        valores = dict(conn.execute(text("SELECT nombre, cuenta_para_semaforo FROM actividades")).all())
    assert valores["Encuentro Marcados"] == 1
    assert valores["Otro"] == 0


def test_no_toca_nada_si_la_columna_ya_existe(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'con_columna.db'}")
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE actividades (id INTEGER PRIMARY KEY, nombre TEXT, cuenta_para_semaforo BOOLEAN NOT NULL DEFAULT 1)")
        )
        conn.execute(text("INSERT INTO actividades (nombre, cuenta_para_semaforo) VALUES ('Otro', 0)"))

    asegurar_esquema_minimo(engine)

    with engine.connect() as conn:
        valor = conn.execute(text("SELECT cuenta_para_semaforo FROM actividades WHERE nombre='Otro'")).scalar()
    assert valor == 0  # no se reescribió con la regla de negocio de nuevo


def test_crea_plantilla_excel_si_falta(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sin_tabla.db'}")
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE actividades (id INTEGER PRIMARY KEY, nombre TEXT, cuenta_para_semaforo BOOLEAN NOT NULL DEFAULT 1)")
        )

    asegurar_esquema_minimo(engine)

    assert "plantilla_excel" in inspect(engine).get_table_names()


def test_no_falla_si_falta_la_tabla_actividades(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'vacia.db'}")
    asegurar_esquema_minimo(engine)  # sin 'actividades': no debe explotar, la salta sin más
    assert "actividades" not in inspect(engine).get_table_names()


def test_es_seguro_correr_dos_veces_seguidas(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'doble.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE actividades (id INTEGER PRIMARY KEY, nombre TEXT)"))
        conn.execute(text("INSERT INTO actividades (nombre) VALUES ('Encuentro Marcados')"))

    asegurar_esquema_minimo(engine)
    asegurar_esquema_minimo(engine)  # segunda pasada: no debe fallar ni duplicar nada

    insp = inspect(engine)
    assert "cuenta_para_semaforo" in {c["name"] for c in insp.get_columns("actividades")}
    assert "plantilla_excel" in insp.get_table_names()


def test_crea_telegram_sesiones_si_falta_y_hay_usuarios(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sin_telegram.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE usuarios (id INTEGER PRIMARY KEY, email TEXT)"))

    asegurar_esquema_minimo(engine)

    assert "telegram_sesiones" in inspect(engine).get_table_names()


def test_no_crea_telegram_sesiones_si_no_existe_la_tabla_usuarios(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sin_usuarios.db'}")
    asegurar_esquema_minimo(engine)  # esquema completamente vacío: no debe explotar
    assert "telegram_sesiones" not in inspect(engine).get_table_names()


def _crear_tabla_personas(engine, servidor=1, bautizado=1):
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE personas (id INTEGER PRIMARY KEY, nombres TEXT, servidor BOOLEAN, bautizado BOOLEAN)"
            )
        )
        conn.execute(
            text("INSERT INTO personas (nombres, servidor, bautizado) VALUES ('Ana', :s, :b)"),
            {"s": servidor, "b": bautizado},
        )


def test_quita_activo_ministerio_si_existe_en_personas(tmp_path):
    """Se sacó (pedido del usuario, 2026-08-14): "Estado" ya cubre el mismo
    criterio (Activo/Inactivo/Fluctúa) — ver migración 64ebe67f6c06."""
    engine = create_engine(f"sqlite:///{tmp_path / 'con_activo_ministerio.db'}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE personas (id INTEGER PRIMARY KEY, nombres TEXT, servidor BOOLEAN, "
                "bautizado BOOLEAN, activo_ministerio BOOLEAN NOT NULL DEFAULT 0)"
            )
        )
        conn.execute(text("INSERT INTO personas (nombres, servidor, bautizado) VALUES ('Ana', 0, 0)"))

    asegurar_esquema_minimo(engine)

    assert "activo_ministerio" not in {c["name"] for c in inspect(engine).get_columns("personas")}


def test_reinicia_servidor_y_bautizado_a_false_la_primera_vez(tmp_path):
    """Pedido del usuario, 2026-08-13: reiniciar servidor/bautizado a False
    para reconfirmar uno por uno — ver migración 7b8b896aedf6. No hay
    garantía de que Alembic haya corrido en el despliegue (mismo problema
    documentado arriba con cuenta_para_semaforo), así que esto se
    autoaplica acá."""
    engine = create_engine(f"sqlite:///{tmp_path / 'reinicio.db'}")
    _crear_tabla_personas(engine, servidor=1, bautizado=1)

    asegurar_esquema_minimo(engine)

    with engine.connect() as conn:
        fila = conn.execute(text("SELECT servidor, bautizado FROM personas WHERE nombres='Ana'")).one()
    assert fila.servidor == 0
    assert fila.bautizado == 0

    with engine.connect() as conn:
        marcado = conn.execute(
            text("SELECT 1 FROM schema_guard_aplicado WHERE clave = 'reset_servidor_bautizado_2026_08_13'")
        ).first()
    assert marcado is not None


def test_no_repite_el_reinicio_en_una_segunda_pasada(tmp_path):
    """Crítico: Render (capa gratuita) reinicia el proceso seguido. Si esto
    se repitiera en cada arranque, borraría cualquier corrección manual que
    el liderazgo ya haya hecho desde la ficha después del primer reinicio."""
    engine = create_engine(f"sqlite:///{tmp_path / 'no_repetir.db'}")
    _crear_tabla_personas(engine, servidor=1, bautizado=1)

    asegurar_esquema_minimo(engine)  # primera pasada: reinicia y marca

    with engine.begin() as conn:
        conn.execute(text("UPDATE personas SET servidor = 1 WHERE nombres='Ana'"))  # corrección manual simulada

    asegurar_esquema_minimo(engine)  # segunda pasada: no debe tocar nada de nuevo

    with engine.connect() as conn:
        valor = conn.execute(text("SELECT servidor FROM personas WHERE nombres='Ana'")).scalar()
    assert valor == 1
