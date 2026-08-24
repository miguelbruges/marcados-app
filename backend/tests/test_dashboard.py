def test_resumen_no_expone_asistieron_30_dias(client, auth_headers):
    """La tarjeta "Asistieron · 30 días" del Panel se quitó por pedido del
    usuario (2026-08-24): no le servía para decidir nada, y el semáforo ya
    cubre la lectura de asistencia con más contexto. Se fue con ella el
    endpoint /dashboard/asistieron-30-dias que la alimentaba."""
    resp = client.get("/dashboard/resumen", headers=auth_headers)
    assert resp.status_code == 200
    assert "asistieron_ultimos_30_dias" not in resp.json()

    assert client.get("/dashboard/asistieron-30-dias", headers=auth_headers).status_code == 404


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
