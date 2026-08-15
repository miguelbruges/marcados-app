def test_login_correcto(client, db_session):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    db_session.add(
        Usuario(
            nombre="Lider Uno",
            email="lider@marcadosapp.dev",
            password_hash=hash_password("otra-clave-123"),
            rol=RolUsuario.LIDER,
        )
    )
    db_session.commit()

    resp = client.post("/auth/login", json={"email": "lider@marcadosapp.dev", "password": "otra-clave-123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["rol"] == "lider"
    assert body["access_token"]


def test_login_password_invalida(client, db_session):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    db_session.add(
        Usuario(
            nombre="Lider Dos",
            email="lider2@marcadosapp.dev",
            password_hash=hash_password("clave-correcta"),
            rol=RolUsuario.LIDER,
        )
    )
    db_session.commit()

    resp = client.post("/auth/login", json={"email": "lider2@marcadosapp.dev", "password": "clave-incorrecta"})
    assert resp.status_code == 401


def test_login_ignora_mayusculas_y_espacios_en_el_email(client, db_session):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    db_session.add(
        Usuario(
            nombre="Admin",
            email="admin@marcadosapp.dev",
            password_hash=hash_password("clave-admin-123"),
            rol=RolUsuario.ADMIN,
        )
    )
    db_session.commit()

    resp = client.post(
        "/auth/login", json={"email": "  Admin@MarcadosApp.DEV  ", "password": "clave-admin-123"}
    )
    assert resp.status_code == 200


def test_endpoint_protegido_sin_token_rechaza(client):
    resp = client.get("/personas")
    assert resp.status_code == 401


def test_endpoint_protegido_con_token_funciona(client, auth_headers):
    resp = client.get("/personas", headers=auth_headers)
    assert resp.status_code == 200


def test_login_se_bloquea_tras_varios_intentos_fallidos(client, db_session):
    """Auditoría 2026-08-14: antes no había ningún freno a intentos
    repetidos de adivinar una contraseña — con datos de menores de edad
    detrás del login, vale la pena. Tras MAX_INTENTOS (5) fallos seguidos
    con el mismo email, el próximo intento (aunque tenga la contraseña
    correcta) debe rechazarse con 429, no volver a intentar verificarla."""
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    db_session.add(
        Usuario(
            nombre="Bloqueable",
            email="bloqueable@marcadosapp.dev",
            password_hash=hash_password("clave-correcta"),
            rol=RolUsuario.LIDER,
        )
    )
    db_session.commit()

    for _ in range(5):
        resp = client.post(
            "/auth/login", json={"email": "bloqueable@marcadosapp.dev", "password": "clave-incorrecta"}
        )
        assert resp.status_code == 401

    resp = client.post(
        "/auth/login", json={"email": "bloqueable@marcadosapp.dev", "password": "clave-correcta"}
    )
    assert resp.status_code == 429
    assert "Probá de nuevo" in resp.json()["detail"]


def test_login_correcto_no_cuenta_para_el_bloqueo(client, db_session):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    db_session.add(
        Usuario(
            nombre="Sin Bloqueo",
            email="sinbloqueo@marcadosapp.dev",
            password_hash=hash_password("clave-correcta"),
            rol=RolUsuario.LIDER,
        )
    )
    db_session.commit()

    for _ in range(4):
        resp = client.post(
            "/auth/login", json={"email": "sinbloqueo@marcadosapp.dev", "password": "clave-incorrecta"}
        )
        assert resp.status_code == 401

    # un login correcto en el medio limpia el contador — el bloqueo es solo
    # tras fallos SEGUIDOS, no un cupo total de intentos en la vida del email
    resp = client.post(
        "/auth/login", json={"email": "sinbloqueo@marcadosapp.dev", "password": "clave-correcta"}
    )
    assert resp.status_code == 200

    resp = client.post(
        "/auth/login", json={"email": "sinbloqueo@marcadosapp.dev", "password": "clave-incorrecta"}
    )
    assert resp.status_code == 401  # no 429 — el contador se reinició
