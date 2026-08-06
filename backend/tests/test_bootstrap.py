from app.models import Usuario
from app.services.bootstrap import bootstrap_admin


def test_no_hace_nada_sin_variables_de_entorno(db_session, monkeypatch):
    monkeypatch.delenv("ADMIN_BOOTSTRAP_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_BOOTSTRAP_PASSWORD", raising=False)

    bootstrap_admin(db_session)

    assert db_session.query(Usuario).count() == 0


def test_crea_admin_cuando_estan_las_variables(db_session, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "admin@marcadosapp.dev")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "clave-inicial-segura")

    bootstrap_admin(db_session)

    usuario = db_session.query(Usuario).filter(Usuario.email == "admin@marcadosapp.dev").first()
    assert usuario is not None
    assert usuario.rol.value == "admin"


def test_normaliza_el_email_a_minusculas(db_session, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "  Admin@MarcadosApp.DEV  ")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "clave-inicial-segura")

    bootstrap_admin(db_session)

    assert db_session.query(Usuario).filter(Usuario.email == "admin@marcadosapp.dev").first() is not None


def test_no_duplica_el_admin_al_correr_dos_veces(db_session, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "admin@marcadosapp.dev")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "clave-inicial-segura")

    bootstrap_admin(db_session)
    bootstrap_admin(db_session)

    assert db_session.query(Usuario).filter(Usuario.email == "admin@marcadosapp.dev").count() == 1


def test_sincroniza_la_contraseña_si_cambia_la_variable(db_session, monkeypatch):
    """Si en un arranque anterior quedó una contraseña distinta (typo, intento
    previo), cambiar la variable y reiniciar debe corregirla — no hay forma
    de borrar el usuario a mano en producción."""
    from app.security import verify_password

    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "admin@marcadosapp.dev")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "clave-vieja")
    bootstrap_admin(db_session)

    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "clave-nueva")
    bootstrap_admin(db_session)

    usuario = db_session.query(Usuario).filter(Usuario.email == "admin@marcadosapp.dev").first()
    assert verify_password("clave-nueva", usuario.password_hash)
    assert not verify_password("clave-vieja", usuario.password_hash)
