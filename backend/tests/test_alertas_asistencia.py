from datetime import date, timedelta

from app.models import Actividad, Asistencia, Evento, Persona
from app.services.alertas_asistencia import (
    calcular_inasistencias_consecutivas,
    calcular_semaforo,
    personas_por_nivel,
    resumen_niveles,
)


def _crear_persona(db, id_unico="MAR-000001"):
    persona = Persona(id_unico=id_unico, nombres="Ana", apellidos="Perez")
    db.add(persona)
    db.flush()
    return persona


def _crear_evento(db, dias_atras, actividad):
    evento = Evento(
        actividad_id=actividad.id,
        nombre=f"Evento -{dias_atras}",
        fecha=date.today() - timedelta(days=dias_atras),
    )
    db.add(evento)
    db.flush()
    return evento


def _actividad(db):
    act = Actividad(nombre="Sábado - Encuentro Marcados")
    db.add(act)
    db.flush()
    return act


def test_semaforo_sin_datos_cuando_no_hay_asistencia_en_la_ventana(db_session):
    persona = _crear_persona(db_session)
    db_session.commit()

    resultado = calcular_semaforo(db_session, persona.id)
    assert resultado.nivel == "sin_datos"
    assert resultado.porcentaje is None


def test_semaforo_verde_con_alta_asistencia_reciente(db_session):
    persona = _crear_persona(db_session)
    actividad = _actividad(db_session)
    for dias in (1, 8, 15, 22):
        evento = _crear_evento(db_session, dias, actividad)
        db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resultado = calcular_semaforo(db_session, persona.id)
    assert resultado.nivel == "verde"
    assert resultado.porcentaje == 100.0
    assert resultado.reuniones_evaluables_ventana == 4


def test_semaforo_rojo_con_baja_asistencia_reciente(db_session):
    persona = _crear_persona(db_session)
    actividad = _actividad(db_session)
    presencias = [True, False, False, False]  # 25% -> por debajo del umbral amarillo (50%)
    for dias, presente in zip((1, 8, 15, 22), presencias):
        evento = _crear_evento(db_session, dias, actividad)
        db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=presente))
    db_session.commit()

    resultado = calcular_semaforo(db_session, persona.id)
    assert resultado.nivel == "rojo"
    assert resultado.porcentaje == 25.0


def test_semaforo_ignora_asistencia_fuera_de_la_ventana(db_session):
    persona = _crear_persona(db_session)
    actividad = _actividad(db_session)
    evento_viejo = _crear_evento(db_session, 400, actividad)  # muy fuera de los 30 días
    db_session.add(Asistencia(persona_id=persona.id, evento_id=evento_viejo.id, presente=False))
    db_session.commit()

    resultado = calcular_semaforo(db_session, persona.id)
    assert resultado.nivel == "sin_datos"  # el registro viejo no cuenta


def test_inasistencias_consecutivas_se_corta_en_la_primera_asistencia(db_session):
    persona = _crear_persona(db_session)
    actividad = _actividad(db_session)
    # de más reciente a más vieja: ausente, ausente, presente, ausente
    for dias, presente in [(1, False), (8, False), (15, True), (22, False)]:
        evento = _crear_evento(db_session, dias, actividad)
        db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=presente))
    db_session.commit()

    assert calcular_inasistencias_consecutivas(db_session, persona.id) == 2


def test_resumen_niveles_cuenta_por_nivel(db_session):
    # El denominador ahora es el mismo para todas: cuántas reuniones hubo.
    # Quien no fue a ninguna da 0% (rojo), no "sin_datos" — antes 'rojo' no
    # se veía nunca en la práctica porque el denominador viejo (cuántas
    # veces ESTA persona quedó registrada) daba siempre 100%.
    actividad = _actividad(db_session)
    verde = _crear_persona(db_session, "MAR-000001")
    rojo = _crear_persona(db_session, "MAR-000002")
    db_session.flush()

    eventos = [_crear_evento(db_session, dias, actividad) for dias in (1, 8, 15, 22)]
    for evento in eventos:
        db_session.add(Asistencia(persona_id=verde.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resumen = resumen_niveles(db_session)
    assert resumen == {"verde": 1, "amarillo": 0, "rojo": 1, "sin_datos": 0}


def test_resumen_niveles_con_una_sola_reunion_ya_asigna_color(db_session):
    # El mínimo por defecto pasó de 2 a 1 (pedido del usuario, 2026-08-24):
    # el grupo se reúne una vez por semana, y exigir 2 reuniones dejaba
    # períodos enteros en "sin datos". Con una sola reunión ya se asigna
    # color — leerlo con pinzas es responsabilidad de quien lo mira, el
    # semáforo nunca es una conclusión pastoral.
    actividad = _actividad(db_session)
    persona = _crear_persona(db_session)
    evento = _crear_evento(db_session, 1, actividad)
    db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resumen = resumen_niveles(db_session)
    assert resumen == {"verde": 1, "amarillo": 0, "rojo": 0, "sin_datos": 0}


def test_resumen_niveles_sin_datos_solo_si_no_hubo_ninguna_reunion(db_session):
    # "Sin datos" ahora significa exactamente eso: en la ventana no hubo
    # ningún Encuentro cargado. No que a esta persona le falte historial.
    _crear_persona(db_session)
    db_session.commit()

    resumen = resumen_niveles(db_session)
    assert resumen == {"verde": 0, "amarillo": 0, "rojo": 0, "sin_datos": 1}


def test_minimo_eventos_sigue_siendo_configurable(db_session):
    # El umbral bajó por defecto, pero la perilla sigue existiendo: quien
    # quiera exigir más reuniones antes de mostrar color puede subirla.
    actividad = _actividad(db_session)
    persona = _crear_persona(db_session)
    evento = _crear_evento(db_session, 1, actividad)
    db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resultado = calcular_semaforo(db_session, persona.id, minimo_eventos=2)
    assert resultado.nivel == "sin_datos"
    assert resultado.porcentaje is None


def test_actividad_que_no_cuenta_para_semaforo_no_afecta_el_calculo(db_session):
    from app.models import Actividad as ActividadModel

    actividad_cuenta = _actividad(db_session)
    actividad_no_cuenta = ActividadModel(nombre="Escuela de Servidores", cuenta_para_semaforo=False)
    db_session.add(actividad_no_cuenta)
    db_session.flush()

    persona = _crear_persona(db_session)
    evento_bueno_1 = _crear_evento(db_session, 1, actividad_cuenta)
    evento_bueno_2 = _crear_evento(db_session, 8, actividad_cuenta)
    evento_ajeno = _crear_evento(db_session, 2, actividad_no_cuenta)  # nunca asistió a este
    db_session.add(Asistencia(persona_id=persona.id, evento_id=evento_bueno_1.id, presente=True))
    db_session.add(Asistencia(persona_id=persona.id, evento_id=evento_bueno_2.id, presente=True))
    db_session.commit()

    resultado = calcular_semaforo(db_session, persona.id)
    # Si el evento_ajeno contara, serían 2/3 (67%, amarillo); al no contar, es 2/2 (100%, verde).
    assert resultado.reuniones_evaluables_ventana == 2
    assert resultado.nivel == "verde"


def test_endpoint_alertas_persona(client, auth_headers, db_session):
    persona = _crear_persona(db_session)
    db_session.commit()

    resp = client.get(f"/personas/{persona.id}/alertas", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["nivel_asistencia"] == "sin_datos"
    assert body["inasistencias_consecutivas"] == 0
    assert "ficha_completa_pct" in body


def test_endpoint_alertas_persona_inexistente_da_404(client, auth_headers):
    resp = client.get("/personas/9999/alertas", headers=auth_headers)
    assert resp.status_code == 404


def test_endpoint_dashboard_alertas_resumen(client, auth_headers, db_session):
    _crear_persona(db_session)
    db_session.commit()

    resp = client.get("/dashboard/alertas-resumen", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"verde": 0, "amarillo": 0, "rojo": 0, "sin_datos": 1}


def test_personas_por_nivel_devuelve_a_quien_corresponde(db_session):
    actividad = _actividad(db_session)
    verde = _crear_persona(db_session, "MAR-000001")
    rojo = _crear_persona(db_session, "MAR-000002")
    db_session.flush()

    eventos = [_crear_evento(db_session, dias, actividad) for dias in (1, 8)]
    for evento in eventos:
        db_session.add(Asistencia(persona_id=verde.id, evento_id=evento.id, presente=True))
    db_session.commit()

    verdes = personas_por_nivel(db_session, "verde")
    assert [p.id_unico for p in verdes] == ["MAR-000001"]

    rojos = personas_por_nivel(db_session, "rojo")
    assert [p.id_unico for p in rojos] == ["MAR-000002"]


def test_resumen_niveles_respeta_ventana_configurable(db_session):
    persona = _crear_persona(db_session)
    actividad = _actividad(db_session)
    eventos = [_crear_evento(db_session, dias, actividad) for dias in (45, 50)]  # fuera de los 30 dias por defecto
    for evento in eventos:
        db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=True))
    db_session.commit()

    # con la ventana por defecto (30 dias) no se ve ninguna reunion
    assert resumen_niveles(db_session)["sin_datos"] == 1
    # con una ventana mas amplia, alcanzan las 2 reuniones minimas
    resumen_60 = resumen_niveles(db_session, ventana_dias=60)
    assert resumen_60["verde"] == 1
    assert resumen_60["sin_datos"] == 0


def test_endpoint_dashboard_alertas_detalle(client, auth_headers, db_session):
    actividad = _actividad(db_session)
    verde = _crear_persona(db_session, "MAR-000001")
    db_session.flush()
    eventos = [_crear_evento(db_session, dias, actividad) for dias in (1, 2)]
    for evento in eventos:
        db_session.add(Asistencia(persona_id=verde.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resp = client.get("/dashboard/alertas-detalle", params={"nivel": "verde"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()[0]["id_unico"] == "MAR-000001"


def test_endpoint_dashboard_alertas_resumen_con_ventana_explicita(client, auth_headers, db_session):
    persona = _crear_persona(db_session)
    actividad = _actividad(db_session)
    eventos = [_crear_evento(db_session, dias, actividad) for dias in (45, 50)]
    for evento in eventos:
        db_session.add(Asistencia(persona_id=persona.id, evento_id=evento.id, presente=True))
    db_session.commit()

    resp = client.get("/dashboard/alertas-resumen", params={"ventana_dias": 60}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["verde"] == 1


def _headers_consolidacion(client, db_session):
    from app.models import RolUsuario, Usuario
    from app.security import hash_password

    usuario = Usuario(
        nombre="Klareth", email="klareth2@marcadosapp.dev", password_hash=hash_password("x"), rol=RolUsuario.CONSOLIDACION
    )
    db_session.add(usuario)
    db_session.commit()
    resp = client.post("/auth/login", json={"email": "klareth2@marcadosapp.dev", "password": "x"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_consolidacion_no_ve_alertas_de_una_persona(client, db_session):
    persona = _crear_persona(db_session)
    db_session.commit()
    headers = _headers_consolidacion(client, db_session)

    resp = client.get(f"/personas/{persona.id}/alertas", headers=headers)
    assert resp.status_code == 403


def test_consolidacion_no_ve_el_resumen_de_alertas(client, db_session):
    headers = _headers_consolidacion(client, db_session)
    resp = client.get("/dashboard/alertas-resumen", headers=headers)
    assert resp.status_code == 403
