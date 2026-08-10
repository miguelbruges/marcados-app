from datetime import date

from app.services.invitaciones import calcular_periodo, ranking_invitaciones


def test_calcular_periodo_mes():
    desde, hasta = calcular_periodo("mes", hoy=date(2026, 8, 15))
    assert desde == date(2026, 8, 1)
    assert hasta == date(2026, 8, 15)


def test_calcular_periodo_trimestre():
    desde, hasta = calcular_periodo("trimestre", hoy=date(2026, 8, 15))
    assert desde == date(2026, 7, 1)  # jul-ago-sep


def test_calcular_periodo_semestre():
    desde, hasta = calcular_periodo("semestre", hoy=date(2026, 2, 1))
    assert desde == date(2026, 1, 1)


def test_calcular_periodo_invalido():
    import pytest

    with pytest.raises(ValueError):
        calcular_periodo("año")


def test_ranking_invitaciones_ordena_por_cantidad(db_session):
    from app.models import Persona

    amy = Persona(id_unico="MAR-000001", nombres="Amy", apellidos="Bravo")
    nelson = Persona(id_unico="MAR-000002", nombres="Nelson", apellidos="Martinez")
    db_session.add_all([amy, nelson])
    db_session.flush()

    # Amy invitó a 2, Nelson a 1, todos con fecha_ingreso dentro del rango
    for i, invitador in enumerate([amy, amy, nelson]):
        db_session.add(
            Persona(
                id_unico=f"MAR-00000{i+3}",
                nombres=f"Nuevo{i}",
                apellidos="Joven",
                fecha_ingreso=date(2026, 8, 5),
                invitado_por_id=invitador.id,
            )
        )
    db_session.commit()

    ranking = ranking_invitaciones(db_session, date(2026, 8, 1), date(2026, 8, 31))
    assert [(r.nombre_completo, r.cantidad) for r in ranking] == [("Amy Bravo", 2), ("Nelson Martinez", 1)]


def test_ranking_invitaciones_ignora_fuera_de_rango(db_session):
    from app.models import Persona

    amy = Persona(id_unico="MAR-000001", nombres="Amy", apellidos="Bravo")
    db_session.add(amy)
    db_session.flush()
    db_session.add(
        Persona(
            id_unico="MAR-000002",
            nombres="Viejo",
            apellidos="Registro",
            fecha_ingreso=date(2026, 1, 5),  # fuera del rango de agosto
            invitado_por_id=amy.id,
        )
    )
    db_session.commit()

    ranking = ranking_invitaciones(db_session, date(2026, 8, 1), date(2026, 8, 31))
    assert ranking == []


def test_ranking_invitaciones_vacio_sin_invitaciones(db_session):
    assert ranking_invitaciones(db_session, date(2026, 8, 1), date(2026, 8, 31)) == []


def test_endpoint_invitaciones_resumen(client, auth_headers):
    invitador = client.post("/personas", json={"nombres": "Amy", "apellidos": "Bravo"}, headers=auth_headers).json()
    hoy = date.today().isoformat()
    client.post(
        "/personas",
        json={"nombres": "Nuevo", "apellidos": "Joven", "fecha_ingreso": hoy, "invitado_por_id": invitador["id"]},
        headers=auth_headers,
    )

    resp = client.get("/personas/invitaciones-resumen", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["nombre_completo"] == "Amy Bravo"
    assert body[0]["cantidad"] == 1


def test_endpoint_invitaciones_resumen_rango_explicito(client, auth_headers):
    invitador = client.post("/personas", json={"nombres": "Amy", "apellidos": "Bravo"}, headers=auth_headers).json()
    client.post(
        "/personas",
        json={"nombres": "Nuevo", "apellidos": "Joven", "fecha_ingreso": "2020-01-15", "invitado_por_id": invitador["id"]},
        headers=auth_headers,
    )

    resp = client.get(
        "/personas/invitaciones-resumen",
        params={"desde": "2020-01-01", "hasta": "2020-01-31"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_crear_persona_con_invitado_por_id_inexistente_da_404(client, auth_headers):
    resp = client.post(
        "/personas", json={"nombres": "X", "apellidos": "Y", "invitado_por_id": 9999}, headers=auth_headers
    )
    assert resp.status_code == 404


def test_editar_persona_no_puede_invitarse_a_si_misma(client, auth_headers):
    persona = client.post("/personas", json={"nombres": "X", "apellidos": "Y"}, headers=auth_headers).json()
    resp = client.patch(
        f"/personas/{persona['id']}", json={"invitado_por_id": persona["id"]}, headers=auth_headers
    )
    assert resp.status_code == 422


def test_persona_out_incluye_invitado_por_nombre(client, auth_headers):
    invitador = client.post("/personas", json={"nombres": "Amy", "apellidos": "Bravo"}, headers=auth_headers).json()
    nuevo = client.post(
        "/personas", json={"nombres": "Nuevo", "apellidos": "Joven", "invitado_por_id": invitador["id"]}, headers=auth_headers
    ).json()
    assert nuevo["invitado_por_nombre"] == "Amy Bravo"
