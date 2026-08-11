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
