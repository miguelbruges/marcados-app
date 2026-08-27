"""Detección y fusión de fichas duplicadas (pedido del usuario, 2026-08-24).

Lo que más importa acá no es que fusione, sino que NO pierda historial y que
no junte a dos personas distintas por su cuenta.
"""

from datetime import date

from app.models import Actividad, Asistencia, AreaServicio, Evento, Persona, PersonaArea, Seguimiento, RolUsuario
from app.services.duplicados import buscar_duplicados, fusionar
from tests.test_seguimiento import _headers_rol


def _persona(db, nombres, apellidos, **extra):
    # id_unico lo asigna el endpoint al crear, no el modelo — acá se crea
    # directo contra la base para armar los escenarios, así que se genera igual.
    from app.services.identidad import siguiente_id_unico

    p = Persona(id_unico=siguiente_id_unico(db), nombres=nombres, apellidos=apellidos, **extra)
    db.add(p)
    db.flush()
    return p


def _evento(db, dias_atras=1, nombre="Encuentro"):
    # Hay UNIQUE(actividad_id, fecha): cada evento del test necesita su
    # propia fecha o la base lo rechaza antes de llegar a lo que se prueba.
    from datetime import timedelta

    act = db.query(Actividad).filter(Actividad.nombre == "Enc").first()
    if not act:
        act = Actividad(nombre="Enc")
        db.add(act)
        db.flush()
    ev = Evento(actividad_id=act.id, nombre=nombre, fecha=date.today() - timedelta(days=dias_atras))
    db.add(ev)
    db.flush()
    return ev


# --- Detección ---

def test_detecta_mismo_nombre_repetido(db_session):
    _persona(db_session, "José", "Pacheco")
    _persona(db_session, "Jose", "Pacheco")
    db_session.commit()

    grupos = buscar_duplicados(db_session)
    assert len(grupos) == 1
    assert len(grupos[0]["personas"]) == 2
    assert "nombre casi idéntico" in grupos[0]["motivos"]


def test_mismo_telefono_afloja_el_nombre_pero_no_lo_regala(db_session):
    """El teléfono repetido permite aceptar el nombre escrito distinto (con
    tildes, en mayúsculas, sin un apellido), pero NO alcanza por sí solo: en
    una familia se comparte el celular. Esta prueba antes afirmaba que
    bastaba el teléfono, y sobre los 120 jóvenes reales eso agrupaba
    hermanas como si fueran la misma persona (corregido 2026-08-24)."""
    _persona(db_session, "Ana María", "Gomez Prieto", telefono="300 111 2222")
    _persona(db_session, "ana maria", "gomez", telefono="3001112222")
    db_session.commit()

    grupos = buscar_duplicados(db_session)
    assert len(grupos) == 1
    assert "mismo teléfono y nombre parecido" in grupos[0]["motivos"]


def test_no_agrupa_a_personas_distintas(db_session):
    """El caso que importa no romper: dos jóvenes que sí son distintos."""
    _persona(db_session, "Ana", "Gomez", telefono="3001112222")
    _persona(db_session, "Carlos", "Martinez", telefono="3009998888")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_dos_hermanos_con_apellido_igual_no_son_duplicados(db_session):
    _persona(db_session, "Juan", "Rosado Montes")
    _persona(db_session, "Nahomi", "Rosado Montes")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_telefono_muy_corto_no_agrupa(db_session):
    """Un dato a medias (una extensión, 3 dígitos) no identifica a nadie."""
    _persona(db_session, "Ana", "Uno", telefono="123")
    _persona(db_session, "Beto", "Dos", telefono="123")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_agrupa_las_cinco_fichas_de_la_misma_persona(db_session):
    """El caso real reportado: 'José Pacheco' cinco veces."""
    for _ in range(5):
        _persona(db_session, "José", "Pacheco")
    db_session.commit()

    grupos = buscar_duplicados(db_session)
    assert len(grupos) == 1
    assert len(grupos[0]["personas"]) == 5


def test_ignora_las_ya_archivadas(db_session):
    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    db_session.commit()
    fusionar(db_session, a.id, b.id, usuario_id=None)

    assert buscar_duplicados(db_session) == []


# --- Fusión: lo que no se puede perder ---

def test_fusionar_mueve_asistencias_y_seguimientos(db_session):
    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    ev1 = _evento(db_session, dias_atras=1, nombre="e1")
    ev2 = _evento(db_session, dias_atras=2, nombre="e2")
    db_session.add(Asistencia(persona_id=a.id, evento_id=ev1.id, presente=True))
    db_session.add(Asistencia(persona_id=b.id, evento_id=ev2.id, presente=True))
    db_session.add(Seguimiento(persona_id=b.id, notas="lo llamé el martes"))
    db_session.commit()

    res = fusionar(db_session, a.id, b.id, usuario_id=None)

    assert res["movido"]["asistencias"] == 1
    assert res["movido"]["seguimientos"] == 1
    assert db_session.query(Asistencia).filter(Asistencia.persona_id == a.id).count() == 2
    assert db_session.query(Seguimiento).filter(Seguimiento.persona_id == a.id).count() == 1


def test_fusionar_no_duplica_si_las_dos_fueron_al_mismo_evento(db_session):
    """Misma presencia contada dos veces: se descarta la repetida en vez de
    romper contra el UNIQUE(persona, evento)."""
    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    ev = _evento(db_session)
    db_session.add(Asistencia(persona_id=a.id, evento_id=ev.id, presente=True))
    db_session.add(Asistencia(persona_id=b.id, evento_id=ev.id, presente=True))
    db_session.commit()

    fusionar(db_session, a.id, b.id, usuario_id=None)

    assert db_session.query(Asistencia).filter(Asistencia.persona_id == a.id).count() == 1
    assert db_session.query(Asistencia).filter(Asistencia.persona_id == b.id).count() == 0


def test_fusionar_archiva_pero_no_borra(db_session):
    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    db_session.commit()
    id_b = b.id

    fusionar(db_session, a.id, b.id, usuario_id=None)

    archivada = db_session.get(Persona, id_b)
    assert archivada is not None, "la ficha no se borra, se archiva"
    assert archivada.activo is False
    assert archivada.nombre_completo == "Jose Pacheco"


def test_fusionar_completa_huecos_sin_pisar_lo_que_ya_habia(db_session):
    a = _persona(db_session, "José", "Pacheco", telefono="3001112222", correo_electronico=None)
    b = _persona(db_session, "Jose", "Pacheco", telefono="3009998888", correo_electronico="jose@ejemplo.com")
    db_session.commit()

    fusionar(db_session, a.id, b.id, usuario_id=None)

    db_session.refresh(a)
    assert a.telefono == "3001112222", "no se pisa un dato que ya estaba"
    assert a.correo_electronico == "jose@ejemplo.com", "sí se completa el que faltaba"


def test_fusionar_conserva_un_si_en_servidor_o_bautizado(db_session):
    a = _persona(db_session, "José", "Pacheco", servidor=False, bautizado=False)
    b = _persona(db_session, "Jose", "Pacheco", servidor=True, bautizado=True)
    db_session.commit()

    fusionar(db_session, a.id, b.id, usuario_id=None)

    db_session.refresh(a)
    assert a.servidor is True
    assert a.bautizado is True


def test_fusionar_reasigna_las_invitaciones_hechas(db_session):
    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    db_session.flush()
    invitado = _persona(db_session, "Nuevo", "Joven", invitado_por_id=b.id)
    db_session.commit()

    res = fusionar(db_session, a.id, b.id, usuario_id=None)

    db_session.refresh(invitado)
    assert res["movido"]["invitaciones"] == 1
    assert invitado.invitado_por_id == a.id


def test_fusionar_mueve_areas_sin_repetir(db_session):
    area = AreaServicio(nombre="Alabanza")
    db_session.add(area)
    db_session.flush()
    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    db_session.add(PersonaArea(persona_id=a.id, area_servicio_id=area.id))
    db_session.add(PersonaArea(persona_id=b.id, area_servicio_id=area.id))
    db_session.commit()

    fusionar(db_session, a.id, b.id, usuario_id=None)

    assert db_session.query(PersonaArea).filter(PersonaArea.persona_id == a.id).count() == 1
    assert db_session.query(PersonaArea).filter(PersonaArea.persona_id == b.id).count() == 0


def test_fusionar_queda_en_bitacora(db_session):
    from app.models import Bitacora

    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco", telefono="3001112222")
    db_session.commit()

    fusionar(db_session, a.id, b.id, usuario_id=None)

    campos = {f.campo for f in db_session.query(Bitacora).filter(Bitacora.tabla == "personas").all()}
    assert "activo" in campos
    assert "fusionada_en" in campos


def test_no_se_puede_fusionar_consigo_misma(db_session):
    import pytest

    a = _persona(db_session, "José", "Pacheco")
    db_session.commit()
    with pytest.raises(ValueError):
        fusionar(db_session, a.id, a.id, usuario_id=None)


def test_no_se_puede_fusionar_una_ya_archivada(db_session):
    import pytest

    a = _persona(db_session, "José", "Pacheco")
    b = _persona(db_session, "Jose", "Pacheco")
    db_session.commit()
    fusionar(db_session, a.id, b.id, usuario_id=None)

    with pytest.raises(ValueError):
        fusionar(db_session, a.id, b.id, usuario_id=None)


# --- Endpoints y permisos ---

def test_endpoint_lista_duplicados(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "dup1@marcadosapp.dev")
    client.post("/personas", json={"nombres": "José", "apellidos": "Pacheco"}, headers=headers)
    client.post("/personas", json={"nombres": "Jose", "apellidos": "Pacheco"}, headers=headers)

    resp = client.get("/personas/duplicados", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_endpoint_fusiona(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "dup2@marcadosapp.dev")
    a = client.post("/personas", json={"nombres": "José", "apellidos": "Pacheco"}, headers=headers).json()
    b = client.post("/personas", json={"nombres": "Jose", "apellidos": "Pacheco"}, headers=headers).json()

    resp = client.post(
        "/personas/duplicados/fusionar",
        json={"conservar_id": a["id"], "absorber_id": b["id"]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["archivada"]["id"] == b["id"]
    assert client.get("/personas/duplicados", headers=headers).json() == []


def test_consolidacion_no_puede_ver_ni_fusionar_duplicados(client, db_session):
    """Juntar fichas es una decisión pastoral con consecuencias sobre el
    historial de una persona — mismo criterio que el resto de lo pastoral."""
    headers = _headers_rol(client, db_session, RolUsuario.CONSOLIDACION, "dup3@marcadosapp.dev")
    assert client.get("/personas/duplicados", headers=headers).status_code == 403
    assert (
        client.post(
            "/personas/duplicados/fusionar", json={"conservar_id": 1, "absorber_id": 2}, headers=headers
        ).status_code
        == 403
    )


def test_fusionar_inexistente_da_404(client, db_session):
    headers = _headers_rol(client, db_session, RolUsuario.LIDER, "dup4@marcadosapp.dev")
    resp = client.post(
        "/personas/duplicados/fusionar", json={"conservar_id": 99998, "absorber_id": 99999}, headers=headers
    )
    assert resp.status_code == 404


# --- Casos reales que el detector agrupaba MAL (encontrados al correrlo
# sobre los 120 jóvenes reales, 2026-08-24). Cada uno es una persona que se
# habría fusionado con otra distinta, borrando su historial. ---

def test_no_encadena_por_transitividad(db_session):
    """El peor caso encontrado: con union-find, A~B por teléfono y B~C por
    nombre metía a A y C en el mismo grupo sin tener nada que ver. Terminaba
    juntando a Amy Paola Bravo Mercado con dos hermanas Marbello Capataz."""
    _persona(db_session, "Amy Paola", "Bravo Mercado", telefono="3005555762")
    _persona(db_session, "Isa Anjholetf", "Marbello Capataz", telefono="3002222997")
    _persona(db_session, "Keren Paola", "Marbello Capataz", telefono="3002222997")
    db_session.commit()

    for g in buscar_duplicados(db_session):
        nombres = {p["nombre_completo"] for p in g["personas"]}
        assert "Amy Paola Bravo Mercado" not in nombres, "no tiene que ver con las Marbello"


def test_una_ficha_con_solo_el_nombre_de_pila_no_matchea_a_todas(db_session):
    """Una ficha cargada solo como "Sofia" empataba al 100% con las tres
    Sofías del grupo, porque token_set_ratio da 100 cuando un nombre está
    contenido en el otro. Sirve para buscar, no para afirmar identidad."""
    _persona(db_session, "Sofia", "")
    _persona(db_session, "Linda Sofía", "Berrocal Mercado")
    _persona(db_session, "Marian Sofia", "Mercado Yela")
    _persona(db_session, "Nathalie Sofía", "Arrieta Acuña")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_hermanos_que_comparten_telefono_no_son_duplicados(db_session):
    """En una familia se comparte el celular. Las hermanas Rosado Montes y
    las Marbello Capataz comparten teléfono y son personas distintas."""
    _persona(db_session, "Briannys Johana", "Rosado Montes", telefono="3001113013")
    _persona(db_session, "Nahomi Shaileth", "Rosado Montes", telefono="3001113013")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_apellidos_distintos_no_son_la_misma_persona(db_session):
    """"Santiago Ramirez" vs "Santiago Gomez" da 80 de parecido y "Maria
    Paula Mendez" vs "...Mendez Navarro" da 81.8 — 1.8 puntos no sirven como
    corte, así que se exige que un nombre contenga al otro."""
    _persona(db_session, "Santiago", "Ramirez", telefono="3002222523")
    _persona(db_session, "Santiago", "Gomez", telefono="3000000801")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_el_hermano_de_alguien_no_es_esa_persona(db_session):
    """Del Excel real: una ficha cargada como "Emmanel Hrmano de Paula"
    quedaba agrupada con "Paula" y con "Maria Paula Mendez"."""
    _persona(db_session, "Maria Paula", "Mendez")
    _persona(db_session, "Emmanel", "Hrmano de Paula")
    db_session.commit()

    assert buscar_duplicados(db_session) == []


def test_si_detecta_el_duplicado_real_del_excel(db_session):
    """El único verdadero de los 120: misma persona cargada dos veces, con
    el nombre escrito distinto pero el mismo teléfono."""
    _persona(db_session, "Estefania", "Contreras Van-strahlen", telefono="3002222998")
    _persona(db_session, "STEFANIA", "contreras", telefono="3002222998")
    db_session.commit()

    grupos = buscar_duplicados(db_session)
    assert len(grupos) == 1
    assert len(grupos[0]["personas"]) == 2


def test_detecta_un_apellido_agregado_despues(db_session):
    """Misma persona, cargada una vez con el apellido completo y otra sin él."""
    _persona(db_session, "Maria Paula", "Mendez")
    _persona(db_session, "Maria Paula", "Mendez Navarro")
    db_session.commit()

    assert len(buscar_duplicados(db_session)) == 1
