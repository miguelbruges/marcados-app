from app.services.importador import parsear_lista


def test_ignora_linea_de_encabezado_con_asistencia():
    texto = "asistencia culto juvenil 25/07/2026\nSofia Hernandez\nCamila Rodriguez"
    assert parsear_lista(texto) == ["Sofia Hernandez", "Camila Rodriguez"]


def test_ignora_lineas_vacias():
    texto = "Sofia Hernandez\n\n\nCamila Rodriguez\n"
    assert parsear_lista(texto) == ["Sofia Hernandez", "Camila Rodriguez"]


def test_ignora_lineas_sin_letras():
    texto = "Sofia Hernandez\n123\n---\nCamila Rodriguez"
    assert parsear_lista(texto) == ["Sofia Hernandez", "Camila Rodriguez"]


def test_conserva_orden_original():
    texto = "Jose David Muñoz\nAnthony Bruges\nSofia Hernandez"
    assert parsear_lista(texto) == ["Jose David Muñoz", "Anthony Bruges", "Sofia Hernandez"]


def test_lista_vacia():
    assert parsear_lista("") == []


def test_solo_encabezado():
    assert parsear_lista("asistencia culto juvenil 25/07/2026") == []
