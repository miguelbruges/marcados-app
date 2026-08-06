def _crear_actividad(db_session, nombre="Culto Juvenil"):
    from app.models import Actividad

    actividad = Actividad(nombre=nombre)
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def test_preview_separa_encabezado_y_matchea_nombres(client, auth_headers, db_session):
    actividad = _crear_actividad(db_session)
    client.post("/personas", json={"nombres": "Sofia", "apellidos": "Hernandez Martinez"}, headers=auth_headers)
    client.post("/personas", json={"nombres": "Camila", "apellidos": "Rodriguez Perez"}, headers=auth_headers)

    texto = "asistencia culto juvenil 25/07/2026\nsofia hernandes\nCamila Rodriguez\nNombre Que No Existe"
    resp = client.post(
        "/asistencia/importar/preview",
        json={"actividad_id": actividad.id, "fecha": "2026-07-25", "texto": texto},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["evento"]["fecha"] == "2026-07-25"
    assert len(body["filas"]) == 3  # el encabezado con "asistencia" se descarta

    fila_sofia = next(f for f in body["filas"] if f["texto_original"] == "sofia hernandes")
    assert fila_sofia["candidatos"][0]["nombre_completo"] == "Sofia Hernandez Martinez"

    fila_sin_match = next(f for f in body["filas"] if f["texto_original"] == "Nombre Que No Existe")
    assert fila_sin_match["confianza"] == "BAJA"


def test_preview_es_idempotente_sobre_el_evento(client, auth_headers, db_session):
    actividad = _crear_actividad(db_session)
    payload = {"actividad_id": actividad.id, "fecha": "2026-08-01", "texto": "Sofia Hernandez"}

    r1 = client.post("/asistencia/importar/preview", json=payload, headers=auth_headers)
    r2 = client.post("/asistencia/importar/preview", json=payload, headers=auth_headers)
    assert r1.json()["evento"]["id"] == r2.json()["evento"]["id"]


def test_confirmar_guarda_asistencia_y_no_duplica_al_repetir(client, auth_headers, db_session):
    actividad = _crear_actividad(db_session)
    persona = client.post(
        "/personas", json={"nombres": "Sofia", "apellidos": "Hernandez"}, headers=auth_headers
    ).json()
    evento = client.post(
        "/eventos",
        json={"actividad_id": actividad.id, "nombre": "Culto Juvenil", "fecha": "2026-08-01"},
        headers=auth_headers,
    ).json()

    payload = {"evento_id": evento["id"], "persona_ids": [persona["id"]]}
    r1 = client.post("/asistencia/importar/confirmar", json=payload, headers=auth_headers)
    assert r1.status_code == 200
    assert r1.json() == {"guardados": 1, "ya_registrados": 0}

    r2 = client.post("/asistencia/importar/confirmar", json=payload, headers=auth_headers)
    assert r2.json() == {"guardados": 0, "ya_registrados": 1}

    lista = client.get(f"/eventos/{evento['id']}/asistencia", headers=auth_headers).json()
    assert len(lista) == 1


def test_confirmar_con_persona_inexistente_da_404(client, auth_headers, db_session):
    actividad = _crear_actividad(db_session)
    evento = client.post(
        "/eventos",
        json={"actividad_id": actividad.id, "nombre": "Culto Juvenil", "fecha": "2026-08-01"},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/asistencia/importar/confirmar",
        json={"evento_id": evento["id"], "persona_ids": [9999]},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_ambiguedad_anthony_queda_pendiente_de_confirmar(client, auth_headers, db_session):
    """Caso de referencia del proyecto: dos personas con nombre casi idéntico
    nunca deben resolverse solas en la importación masiva."""
    actividad = _crear_actividad(db_session)
    client.post(
        "/personas", json={"nombres": "Anthony de Jesus", "apellidos": "Bruges Gutierrez"}, headers=auth_headers
    )
    client.post(
        "/personas", json={"nombres": "Anthony de Jesus", "apellidos": "Bruges Gutierrez"}, headers=auth_headers
    )

    resp = client.post(
        "/asistencia/importar/preview",
        json={"actividad_id": actividad.id, "fecha": "2026-08-01", "texto": "Anthony Bruges Gutierrez"},
        headers=auth_headers,
    )
    fila = resp.json()["filas"][0]
    assert fila["confianza"] != "ALTA"
    assert len(fila["candidatos"]) >= 2
