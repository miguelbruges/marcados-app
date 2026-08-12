from app.models import RolUsuario, Usuario
from app.security import hash_password


def _headers_rol(client, db_session, rol, email):
    usuario = Usuario(nombre="Test", email=email, password_hash=hash_password("x"), rol=rol)
    db_session.add(usuario)
    db_session.commit()
    resp = client.post("/auth/login", json={"email": email, "password": "x"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_lider_puede_crear_seguimiento(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "lider@marcadosapp.dev")
    resp = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers)
    persona_id = resp.json()["id"]

    resp = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "Llamada de seguimiento"},
        headers=headers,
    )
    assert resp.status_code == 201


def test_seguimiento_usa_hoy_si_no_se_manda_fecha(client, db_session):
    from datetime import date

    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "lider5@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]

    resp = client.post("/seguimiento", json={"persona_id": persona_id, "notas": "x"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["fecha"] == date.today().isoformat()


def test_seguimiento_respeta_fecha_explicita(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "lider6@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]

    resp = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "x", "fecha": "2026-01-15"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["fecha"] == "2026-01-15"


def test_encargado_puede_ver_historial_seguimiento(client, db_session):
    headers_lider = _headers_rol(client, db_session, RolUsuario.LIDER, "lider2@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers_lider).json()["id"]

    headers_encargado = _headers_rol(client, db_session, RolUsuario.ENCARGADO, "amy@marcadosapp.dev")
    resp = client.get(f"/seguimiento/persona/{persona_id}", headers=headers_encargado)
    assert resp.status_code == 200


def test_consolidacion_no_puede_crear_seguimiento(client, db_session):
    headers_lider = _headers_rol(client, db_session, RolUsuario.LIDER, "lider3@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers_lider).json()["id"]

    headers_consolidacion = _headers_rol(client, db_session, RolUsuario.CONSOLIDACION, "klareth@marcadosapp.dev")
    resp = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "no debería poder"},
        headers=headers_consolidacion,
    )
    assert resp.status_code == 403


def test_consolidacion_no_puede_ver_historial_seguimiento(client, db_session):
    headers_lider = _headers_rol(client, db_session, RolUsuario.LIDER, "lider4@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers_lider).json()["id"]

    headers_consolidacion = _headers_rol(client, db_session, RolUsuario.CONSOLIDACION, "sofia@marcadosapp.dev")
    resp = client.get(f"/seguimiento/persona/{persona_id}", headers=headers_consolidacion)
    assert resp.status_code == 403
