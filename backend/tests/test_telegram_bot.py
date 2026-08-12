from app.models import Actividad, Asistencia, Evento, Persona, RolUsuario, Usuario
from app.security import hash_password
from app.services.telegram_bot import TEXTO_AYUDA, procesar_mensaje

CHAT_ID = "12345"


def _crear_usuario(db, rol=RolUsuario.LIDER, email="lider@marcadosapp.dev", password="clave123"):
    usuario = Usuario(nombre="Lider Test", email=email, password_hash=hash_password(password), rol=rol)
    db.add(usuario)
    db.commit()
    return usuario


def test_sin_texto_devuelve_ayuda(db_session):
    assert procesar_mensaje(db_session, CHAT_ID, "") == TEXTO_AYUDA


def test_ayuda_y_start(db_session):
    assert procesar_mensaje(db_session, CHAT_ID, "/ayuda") == TEXTO_AYUDA
    assert procesar_mensaje(db_session, CHAT_ID, "/start") == TEXTO_AYUDA


def test_comando_sin_sesion_pide_login(db_session):
    resp = procesar_mensaje(db_session, CHAT_ID, "/resumen")
    assert "login" in resp.lower()


def test_login_con_credenciales_invalidas(db_session):
    _crear_usuario(db_session)
    resp = procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave-mala")
    assert "incorrectos" in resp.lower()


def test_login_exitoso_y_luego_resumen(db_session):
    _crear_usuario(db_session)
    resp = procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    assert "Listo" in resp
    assert "lider" in resp.lower()

    resp2 = procesar_mensaje(db_session, CHAT_ID, "/resumen")
    assert "Total jóvenes: 0" in resp2


def test_login_uso_incorrecto(db_session):
    resp = procesar_mensaje(db_session, CHAT_ID, "/login soloelemail")
    assert "Uso: /login" in resp


def test_logout_sin_sesion(db_session):
    resp = procesar_mensaje(db_session, CHAT_ID, "/logout")
    assert "no tenía" in resp.lower()


def test_login_luego_logout_pide_login_de_nuevo(db_session):
    _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/logout")
    assert "cerrada" in resp.lower()

    resp2 = procesar_mensaje(db_session, CHAT_ID, "/resumen")
    assert "login" in resp2.lower()


def test_semaforo_bloqueado_para_consolidacion(db_session):
    _crear_usuario(db_session, rol=RolUsuario.CONSOLIDACION, email="consolidacion@marcadosapp.dev")
    procesar_mensaje(db_session, CHAT_ID, "/login consolidacion@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/semaforo")
    assert "solo para líderes" in resp.lower()


def test_semaforo_permitido_para_lider(db_session):
    _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/semaforo")
    assert "Verde" in resp
    assert "Rojo" in resp
    assert "espiritual" not in resp.lower()  # nunca se expone el semáforo espiritual


def test_incompletas_sin_nadie(db_session):
    _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/incompletas")
    assert "ninguna" in resp.lower()


def test_incompletas_lista_personas_bajo_el_umbral(db_session):
    _crear_usuario(db_session)
    db_session.add(Persona(id_unico="MAR-000001", nombres="Ana", apellidos="Perez"))
    db_session.commit()
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/incompletas")
    assert "Ana Perez" in resp


def test_buscar_uso_incorrecto(db_session):
    _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/buscar")
    assert "Uso: /buscar" in resp


def test_buscar_encuentra_por_nombre(db_session):
    _crear_usuario(db_session)
    db_session.add(Persona(id_unico="MAR-000001", nombres="Sofia", apellidos="Hernandez"))
    db_session.commit()
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/buscar sofia hernandez")
    assert "Sofia Hernandez" in resp
    assert "MAR-000001" in resp


def test_comando_desconocido(db_session):
    _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/loquesea")
    assert "no entendí" in resp.lower()


def test_comando_con_sufijo_de_bot_se_reconoce(db_session):
    _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/resumen@MiBotDeMarcados")
    assert "Total jóvenes" in resp


def test_usuario_inactivo_pierde_la_sesion(db_session):
    usuario = _crear_usuario(db_session)
    procesar_mensaje(db_session, CHAT_ID, "/login lider@marcadosapp.dev clave123")
    usuario.activo = False
    db_session.commit()
    resp = procesar_mensaje(db_session, CHAT_ID, "/resumen")
    assert "login" in resp.lower()


def test_relogin_actualiza_la_sesion_existente(db_session):
    _crear_usuario(db_session, email="a@marcadosapp.dev")
    _crear_usuario(db_session, email="b@marcadosapp.dev")
    procesar_mensaje(db_session, CHAT_ID, "/login a@marcadosapp.dev clave123")
    resp = procesar_mensaje(db_session, CHAT_ID, "/login b@marcadosapp.dev clave123")
    assert "Listo" in resp

    from app.models import TelegramSesion

    sesiones = db_session.query(TelegramSesion).filter(TelegramSesion.chat_id == CHAT_ID).all()
    assert len(sesiones) == 1  # no duplica, actualiza la existente
