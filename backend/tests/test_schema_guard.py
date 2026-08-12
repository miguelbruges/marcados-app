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
