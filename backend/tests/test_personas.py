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
