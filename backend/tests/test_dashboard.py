from datetime import date, timedelta

from app.models import Actividad, Asistencia, Evento, Persona


def test_asistieron_30_dias_lista_solo_a_quien_asistio_en_la_ventana(client, auth_headers, db_session):
    persona_reciente = Persona(id_unico="MAR-000001", nombres="Ana", apellidos="Reciente")
    persona_vieja = Persona(id_unico="MAR-000002", nombres="Beto", apellidos="Viejo")
    actividad = Actividad(nombre="Sábado - Encuentro Marcados")
    db_session.add_all([persona_reciente, persona_vieja, actividad])
    db_session.flush()

    evento_reciente = Evento(actividad_id=actividad.id, nombre="reciente", fecha=date.today() - timedelta(days=5))
    evento_viejo = Evento(actividad_id=actividad.id, nombre="viejo", fecha=date.today() - timedelta(days=400))
    db_session.add_all([evento_reciente, evento_viejo])
    db_session.flush()

    db_session.add(Asistencia(persona_id=persona_reciente.id, evento_id=evento_reciente.id, presente=True))
    db_session.add(Asistencia(persona_id=persona_vieja.id, evento_id=evento_viejo.id, presente=True))
    db_session.commit()

    resp = client.get("/dashboard/asistieron-30-dias", headers=auth_headers)
    assert resp.status_code == 200
    nombres = [p["nombre_completo"] for p in resp.json()]
    assert nombres == ["Ana Reciente"]


def test_asistieron_30_dias_no_duplica_si_asistio_varias_veces(client, auth_headers, db_session):
    persona = Persona(id_unico="MAR-000001", nombres="Ana", apellidos="Multiple")
    actividad = Actividad(nombre="Sábado - Encuentro Marcados")
    db_session.add_all([persona, actividad])
    db_session.flush()

    for dias in (1, 8):
        evento = Evento(actividad_id=actividad.id, nombre=f"e-{dias}", fecha=date.today() - timedelta(days=dias))
        db_session.add(evento)
        db_session.flush()
        db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resp = client.get("/dashboard/asistieron-30-dias", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_asistieron_30_dias_vacio_sin_datos(client, auth_headers):
    resp = client.get("/dashboard/asistieron-30-dias", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_resumen_activos_cuenta_estado_activo_no_el_activo_de_ficha(client, auth_headers):
    """`estado` (catálogo Activo/Inactivo/Fluctúa, migrado del Excel
    original) es el criterio real de "sigue en el ministerio" — separado
    de `activo` (la ficha existe/no está archivada). Antes el Panel
    mostraba "Activos" leyendo `activo`, que es True por defecto para toda
    persona nueva, así que daba el total siempre sin distinguir nada real
    (pedido del usuario, 2026-08-13). Se probó primero con un campo nuevo
    aparte (`activo_ministerio`), pero era redundante con `estado`, que ya
    cubría lo mismo (pedido del usuario, 2026-08-14)."""
    p1 = client.post("/personas", json={"nombres": "Ana", "apellidos": "Uno"}, headers=auth_headers).json()
    client.post("/personas", json={"nombres": "Beto", "apellidos": "Dos", "estado": "Inactivo"}, headers=auth_headers)

    resp = client.get("/dashboard/resumen", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["activos"] == 0  # nadie con estado="Activo" todavía

    client.patch(f"/personas/{p1['id']}", json={"estado": "Activo"}, headers=auth_headers)
    resp = client.get("/dashboard/resumen", headers=auth_headers)
    assert resp.json()["activos"] == 1
