def test_listar_actividades_solo_activas_por_defecto(client, auth_headers):
    client.post("/actividades", json={"nombre": "Encuentro Marcados"}, headers=auth_headers)
    inactiva = client.post("/actividades", json={"nombre": "Vieja"}, headers=auth_headers).json()
    client.patch(f"/actividades/{inactiva['id']}", json={"activo": False}, headers=auth_headers)

    resp = client.get("/actividades", headers=auth_headers)
    assert resp.status_code == 200
    nombres = [a["nombre"] for a in resp.json()]
    assert "Encuentro Marcados" in nombres
    assert "Vieja" not in nombres


def test_listar_actividades_incluir_inactivas_con_filtro(client, auth_headers):
    inactiva = client.post("/actividades", json={"nombre": "Vieja"}, headers=auth_headers).json()
    client.patch(f"/actividades/{inactiva['id']}", json={"activo": False}, headers=auth_headers)

    resp = client.get("/actividades", params={"activo": "false"}, headers=auth_headers)
    assert resp.status_code == 200
    assert any(a["nombre"] == "Vieja" for a in resp.json())


def test_crear_actividad_duplicada_da_409(client, auth_headers):
    client.post("/actividades", json={"nombre": "Encuentro Marcados"}, headers=auth_headers)
    resp = client.post("/actividades", json={"nombre": "Encuentro Marcados"}, headers=auth_headers)
    assert resp.status_code == 409


def test_solo_admin_puede_crear_actividad(client, db_session):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    lider = Usuario(nombre="Lider", email="lider6@marcadosapp.dev", password_hash=hash_password("x"), rol=RolUsuario.LIDER)
    db_session.add(lider)
    db_session.commit()
    token = client.post("/auth/login", json={"email": "lider6@marcadosapp.dev", "password": "x"}).json()["access_token"]

    resp = client.post("/actividades", json={"nombre": "Nueva"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_renombrar_actividad(client, auth_headers):
    act = client.post("/actividades", json={"nombre": "Vieja"}, headers=auth_headers).json()
    resp = client.patch(f"/actividades/{act['id']}", json={"nombre": "Nueva"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["nombre"] == "Nueva"


def test_editar_actividad_inexistente_da_404(client, auth_headers):
    resp = client.patch("/actividades/9999", json={"nombre": "X"}, headers=auth_headers)
    assert resp.status_code == 404
