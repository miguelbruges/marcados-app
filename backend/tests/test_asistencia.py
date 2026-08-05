def _crear_actividad(db_session, nombre="Culto Juvenil"):
    from app.models import Actividad

    actividad = Actividad(nombre=nombre)
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def test_crear_evento_es_idempotente_por_actividad_y_fecha(client, auth_headers, db_session):
    actividad = _crear_actividad(db_session)
    payload = {"actividad_id": actividad.id, "nombre": "Culto Juvenil 25/07/2026", "fecha": "2026-07-25"}

    r1 = client.post("/eventos", json=payload, headers=auth_headers)
    r2 = client.post("/eventos", json=payload, headers=auth_headers)

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


def test_registrar_asistencia_no_duplica_para_misma_persona_evento(client, auth_headers, db_session):
    actividad = _crear_actividad(db_session)
    evento = client.post(
        "/eventos",
        json={"actividad_id": actividad.id, "nombre": "Culto Juvenil", "fecha": "2026-08-01"},
        headers=auth_headers,
    ).json()
    persona = client.post(
        "/personas", json={"nombres": "Sofia", "apellidos": "Hernandez"}, headers=auth_headers
    ).json()

    payload = {"persona_id": persona["id"], "evento_id": evento["id"], "presente": True}
    r1 = client.post("/asistencia", json=payload, headers=auth_headers)
    r2 = client.post("/asistencia", json=payload, headers=auth_headers)

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]

    lista = client.get(f"/eventos/{evento['id']}/asistencia", headers=auth_headers).json()
    assert len(lista) == 1


def test_ver_asistencia_de_evento_inexistente_da_404(client, auth_headers):
    resp = client.get("/eventos/9999/asistencia", headers=auth_headers)
    assert resp.status_code == 404
