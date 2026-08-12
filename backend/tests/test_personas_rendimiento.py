"""Guarda contra que vuelva a colarse un N+1: listar personas serializa
invitado_por_nombre y areas_servicio (relaciones), y sin precarga cada una
dispara una consulta perezosa POR persona — con datos reales (120
personas) eso es la diferencia entre 1 consulta y 100+, cada una un viaje
de red aparte contra el pooler remoto (pedido del usuario, 2026-08-12:
"no quiero que demoren"). Cuenta las consultas SQL de verdad en vez de
solo probar que el endpoint responde bien."""

from contextlib import contextmanager

from sqlalchemy import event

from app.models import AreaServicio, PersonaArea


@contextmanager
def contar_consultas(engine):
    contador = {"n": 0}

    def _contar(*args, **kwargs):
        contador["n"] += 1

    event.listen(engine, "before_cursor_execute", _contar)
    try:
        yield contador
    finally:
        event.remove(engine, "before_cursor_execute", _contar)


def test_listar_personas_no_hace_una_consulta_por_persona(client, auth_headers, db_session):
    area = AreaServicio(nombre="Alabanza")
    db_session.add(area)
    db_session.commit()

    personas_creadas = []
    for i in range(8):
        resp = client.post(
            "/personas",
            json={"nombres": f"Joven{i}", "apellidos": "Apellido"},
            headers=auth_headers,
        )
        personas_creadas.append(resp.json())

    # a algunas les asigno invitador y área de servicio — los dos campos
    # que dependen de relaciones y son el motivo real de la prueba
    primero_id = personas_creadas[0]["id"]
    for p in personas_creadas[1:]:
        client.patch(f"/personas/{p['id']}", json={"invitado_por_id": primero_id}, headers=auth_headers)
        client.put(f"/personas/{p['id']}/areas", json={"area_ids": [area.id]}, headers=auth_headers)

    engine = db_session.get_bind()
    with contar_consultas(engine) as contador:
        resp = client.get("/personas", headers=auth_headers)

    assert resp.status_code == 200
    assert len(resp.json()) == 8
    # con precarga: 1 consulta para personas + 1 para invitado_por + 1 para
    # areas + 1 para area_servicio, sin importar cuántas personas haya.
    # Sin precarga (el bug) serían decenas: una por persona por relación.
    assert contador["n"] <= 6, f"se ejecutaron {contador['n']} consultas — parece haber vuelto el N+1"


def test_obtener_persona_no_hace_consultas_extra_por_relacion(client, auth_headers, db_session):
    area = AreaServicio(nombre="Logística")
    db_session.add(area)
    db_session.commit()

    invitador = client.post("/personas", json={"nombres": "Ana", "apellidos": "Perez"}, headers=auth_headers).json()
    persona = client.post(
        "/personas",
        json={"nombres": "Sofia", "apellidos": "Hernandez", "invitado_por_id": invitador["id"]},
        headers=auth_headers,
    ).json()
    client.put(f"/personas/{persona['id']}/areas", json={"area_ids": [area.id]}, headers=auth_headers)

    engine = db_session.get_bind()
    with contar_consultas(engine) as contador:
        resp = client.get(f"/personas/{persona['id']}", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["invitado_por_nombre"] == "Ana Perez"
    assert resp.json()["areas_servicio"][0]["nombre"] == "Logística"
    assert contador["n"] <= 6
