def test_crear_persona_asigna_id_unico_correlativo(client, auth_headers):
    payload = {"nombres": "Sofia", "apellidos": "Hernandez Martinez"}
    r1 = client.post("/personas", json=payload, headers=auth_headers)
    r2 = client.post("/personas", json={**payload, "nombres": "Camila"}, headers=auth_headers)

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id_unico"] == "MAR-000001"
    assert r2.json()["id_unico"] == "MAR-000002"


def test_listar_personas_solo_activas_por_defecto(client, auth_headers):
    client.post("/personas", json={"nombres": "Activa", "apellidos": "Uno"}, headers=auth_headers)

    resp = client.get("/personas", headers=auth_headers)
    assert resp.status_code == 200
    assert all(p["activo"] for p in resp.json())


def test_buscar_coincidencias_endpoint(client, auth_headers):
    client.post("/personas", json={"nombres": "Sofia", "apellidos": "Hernandez Martinez"}, headers=auth_headers)
    client.post("/personas", json={"nombres": "Camila", "apellidos": "Rodriguez Perez"}, headers=auth_headers)

    resp = client.get("/personas/buscar/coincidencias", params={"q": "sofia hernandes"}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["candidatos"][0]["nombre_completo"] == "Sofia Hernandez Martinez"


def test_obtener_persona_inexistente_da_404(client, auth_headers):
    resp = client.get("/personas/9999", headers=auth_headers)
    assert resp.status_code == 404


def test_crear_persona_asigna_fecha_ingreso_automatica_si_no_se_manda(client, auth_headers):
    from datetime import date

    resp = client.post("/personas", json={"nombres": "Sofia", "apellidos": "Hernandez"}, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["fecha_ingreso"] == date.today().isoformat()


def test_crear_persona_respeta_fecha_ingreso_explicita(client, auth_headers):
    resp = client.post(
        "/personas",
        json={"nombres": "Sofia", "apellidos": "Hernandez", "fecha_ingreso": "2020-01-15"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["fecha_ingreso"] == "2020-01-15"


def test_marcar_nuevo_servidor_usa_hoy_por_defecto(client, auth_headers):
    from datetime import date

    persona = client.post(
        "/personas", json={"nombres": "Sofia", "apellidos": "Hernandez"}, headers=auth_headers
    ).json()
    assert persona["servidor"] is False

    resp = client.post(f"/personas/{persona['id']}/marcar-servidor", json={}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["servidor"] is True
    assert body["fecha_inicio_servicio"] == date.today().isoformat()


def test_marcar_nuevo_servidor_con_fecha_explicita_de_la_reunion_staff(client, auth_headers):
    persona = client.post(
        "/personas", json={"nombres": "Camila", "apellidos": "Rodriguez"}, headers=auth_headers
    ).json()

    resp = client.post(
        f"/personas/{persona['id']}/marcar-servidor",
        json={"fecha_inicio_servicio": "2026-06-01"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["fecha_inicio_servicio"] == "2026-06-01"


def test_marcar_nuevo_servidor_persona_inexistente_da_404(client, auth_headers):
    resp = client.post("/personas/9999/marcar-servidor", json={}, headers=auth_headers)
    assert resp.status_code == 404


def test_persona_nueva_no_es_registro_historico(client, auth_headers):
    resp = client.post("/personas", json={"nombres": "Sofia", "apellidos": "Hernandez"}, headers=auth_headers)
    assert resp.json()["registro_historico"] is False


def test_editar_persona_aplica_solo_los_campos_enviados(client, auth_headers):
    persona = client.post(
        "/personas", json={"nombres": "Sofia", "apellidos": "Hernandez", "telefono": "3000000000"},
        headers=auth_headers,
    ).json()

    resp = client.patch(f"/personas/{persona['id']}", json={"telefono": "3001111111"}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["telefono"] == "3001111111"
    assert body["nombres"] == "Sofia"  # no tocado, sigue igual


def test_editar_persona_inexistente_da_404(client, auth_headers):
    resp = client.patch("/personas/9999", json={"telefono": "300"}, headers=auth_headers)
    assert resp.status_code == 404


def test_persona_creada_completa_incluye_pct_y_datos_faltantes(client, auth_headers):
    resp = client.post(
        "/personas",
        json={"nombres": "Sofia", "apellidos": "Hernandez", "telefono": "3000000000"},
        headers=auth_headers,
    )
    body = resp.json()
    assert "ficha_completa_pct" in body
    assert "Dirección" in body["datos_faltantes"]


def test_fichas_incompletas_solo_lista_las_que_estan_bajo_el_umbral(client, auth_headers):
    # Ficha vacía (solo nombres/apellidos) -> muy por debajo del umbral por defecto (70%).
    client.post("/personas", json={"nombres": "Incompleta", "apellidos": "Uno"}, headers=auth_headers)

    resp = client.get("/personas/fichas-incompletas", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["nombre_completo"] == "Incompleta Uno"
    assert body[0]["ficha_completa_pct"] < 70.0


def test_fichas_incompletas_respeta_umbral_explicito_por_query(client, auth_headers):
    client.post("/personas", json={"nombres": "Incompleta", "apellidos": "Uno"}, headers=auth_headers)

    resp = client.get("/personas/fichas-incompletas", params={"umbral": 0}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_editar_persona_registra_bitacora_solo_de_lo_que_cambio(client, auth_headers, db_session):
    from app.models import Bitacora

    persona = client.post(
        "/personas", json={"nombres": "Sofia", "apellidos": "Hernandez", "telefono": "3000000000"},
        headers=auth_headers,
    ).json()

    # mismo valor -> no debe generar bitacora
    client.patch(f"/personas/{persona['id']}", json={"telefono": "3000000000"}, headers=auth_headers)
    sin_cambio = db_session.query(Bitacora).filter(Bitacora.campo == "telefono").count()
    assert sin_cambio == 0

    # valor distinto -> si genera bitacora con antes/despues
    client.patch(f"/personas/{persona['id']}", json={"telefono": "3009999999"}, headers=auth_headers)
    registro = db_session.query(Bitacora).filter(Bitacora.campo == "telefono").first()
    assert registro is not None
    assert registro.valor_anterior == "3000000000"
    assert registro.valor_nuevo == "3009999999"
    assert registro.tabla == "personas"
