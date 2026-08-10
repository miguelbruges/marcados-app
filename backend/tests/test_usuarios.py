def _crear_lider(db_session, email="lider@marcadosapp.dev"):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    usuario = Usuario(nombre="Lider Test", email=email, password_hash=hash_password("x"), rol=RolUsuario.LIDER)
    db_session.add(usuario)
    db_session.commit()
    return usuario


def _headers_lider(client, db_session):
    _crear_lider(db_session)
    resp = client.post("/auth/login", json={"email": "lider@marcadosapp.dev", "password": "x"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_puede_crear_usuario_con_rol_valido(client, auth_headers):
    resp = client.post(
        "/usuarios",
        json={"nombre": "Encargada Zona 1", "email": "encargada@marcadosapp.dev", "password": "clave123", "rol": "encargado"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["rol"] == "encargado"


def test_crear_usuario_con_rol_invalido_da_422(client, auth_headers):
    resp = client.post(
        "/usuarios",
        json={"nombre": "X", "email": "x@marcadosapp.dev", "password": "clave123", "rol": "superadmin"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_crear_usuario_email_duplicado_da_409(client, auth_headers):
    payload = {"nombre": "Uno", "email": "dup@marcadosapp.dev", "password": "clave123", "rol": "lider"}
    r1 = client.post("/usuarios", json=payload, headers=auth_headers)
    r2 = client.post("/usuarios", json=payload, headers=auth_headers)
    assert r1.status_code == 201
    assert r2.status_code == 409


def test_lider_no_puede_crear_usuarios(client, db_session):
    headers = _headers_lider(client, db_session)
    resp = client.post(
        "/usuarios",
        json={"nombre": "Otro", "email": "otro@marcadosapp.dev", "password": "clave123", "rol": "lider"},
        headers=headers,
    )
    assert resp.status_code == 403


def test_listar_usuarios_solo_admin(client, db_session, auth_headers):
    _crear_lider(db_session)
    resp = client.get("/usuarios", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2  # admin (fixture) + el lider creado


def test_desactivar_usuario(client, db_session, auth_headers):
    lider = _crear_lider(db_session)
    resp = client.patch(f"/usuarios/{lider.id}/desactivar", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["activo"] is False
