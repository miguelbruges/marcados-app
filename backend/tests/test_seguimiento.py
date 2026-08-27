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


def test_listar_requieren_atencion_solo_trae_los_marcados(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "lider7@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]

    client.post("/seguimiento", json={"persona_id": persona_id, "notas": "normal"}, headers=headers)
    client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "urgente", "requiere_atencion": True},
        headers=headers,
    )

    resp = client.get("/seguimiento/requieren-atencion", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["notas"] == "urgente"
    assert body[0]["persona_nombre"] == "Ana Perez"


def test_consolidacion_no_ve_requieren_atencion(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.CONSOLIDACION, "consolidacion2@marcadosapp.dev")
    resp = client.get("/seguimiento/requieren-atencion", headers=headers)
    assert resp.status_code == 403


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


# --- Resolver "requiere atención" (pedido del usuario, 2026-08-24) ---
# La marca se podía poner pero no sacar, así que el centro de alertas solo
# crecía y el contador quedaba en 99+ con cosas ya resueltas.

def test_resolver_baja_la_marca_y_lo_saca_del_centro_de_alertas(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "resolver1@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]
    seg = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "hay que llamarla", "requiere_atencion": True},
        headers=headers,
    ).json()

    assert len(client.get("/seguimiento/requieren-atencion", headers=headers).json()) == 1

    resp = client.patch(f"/seguimiento/{seg['id']}/resolver", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["requiere_atencion"] is False
    assert client.get("/seguimiento/requieren-atencion", headers=headers).json() == []


def test_resolver_no_borra_la_nota_del_historial(client, db_session):
    """La bandera baja, pero lo que escribió una persona no se toca."""
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "resolver2@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]
    seg = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "conversamos el domingo", "requiere_atencion": True},
        headers=headers,
    ).json()

    client.patch(f"/seguimiento/{seg['id']}/resolver", headers=headers)

    historial = client.get(f"/seguimiento/persona/{persona_id}", headers=headers).json()
    assert len(historial) == 1
    assert historial[0]["notas"] == "conversamos el domingo"


def test_resolver_es_idempotente(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "resolver3@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]
    seg = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "x", "requiere_atencion": True},
        headers=headers,
    ).json()

    assert client.patch(f"/seguimiento/{seg['id']}/resolver", headers=headers).status_code == 200
    assert client.patch(f"/seguimiento/{seg['id']}/resolver", headers=headers).status_code == 200


def test_resolver_queda_en_bitacora(client, db_session):
    from app.models import Bitacora

    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "resolver4@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers).json()["id"]
    seg = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "x", "requiere_atencion": True},
        headers=headers,
    ).json()
    client.patch(f"/seguimiento/{seg['id']}/resolver", headers=headers)

    filas = db_session.query(Bitacora).filter(Bitacora.tabla == "seguimientos").all()
    assert len(filas) == 1
    assert filas[0].campo == "requiere_atencion"
    assert filas[0].valor_nuevo == "False"


def test_resolver_inexistente_da_404(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "resolver5@marcadosapp.dev")
    assert client.patch("/seguimiento/99999/resolver", headers=headers).status_code == 404


def test_consolidacion_no_puede_resolver(client, db_session):
    headers_lider = _headers_rol(client, db_session, RolUsuario.LIDER, "resolver6@marcadosapp.dev")
    persona_id = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=headers_lider).json()["id"]
    seg = client.post(
        "/seguimiento",
        json={"persona_id": persona_id, "notas": "x", "requiere_atencion": True},
        headers=headers_lider,
    ).json()

    headers_consolidacion = _headers_rol(client, db_session, RolUsuario.CONSOLIDACION, "resolver7@marcadosapp.dev")
    assert client.patch(f"/seguimiento/{seg['id']}/resolver", headers=headers_consolidacion).status_code == 403
