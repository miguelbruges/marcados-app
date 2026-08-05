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


def test_endpoint_protegido_sin_token_rechaza(client):
    resp = client.get("/personas")
    assert resp.status_code == 401


def test_endpoint_protegido_con_token_funciona(client, auth_headers):
    resp = client.get("/personas", headers=auth_headers)
    assert resp.status_code == 200
