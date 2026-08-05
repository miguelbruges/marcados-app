import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.matching import Confianza, buscar_candidatos, normalizar

PERSONAS = [
    (1, "MAR-000001", "Sofia Hernandez Martinez"),
    (2, "MAR-000002", "Camila Rodriguez Perez"),
    (3, "MAR-000003", "Jose David Muñoz Escorcia"),
]


def test_normalizar_quita_tildes_y_mayusculas():
    assert normalizar("Sofía Hernández") == "sofia hernandez"
    assert normalizar("  SOFIA   hernandez  ") == "sofia hernandez"


def test_coincidencia_exacta_es_alta_confianza():
    resultado = buscar_candidatos("Sofia Hernandez Martinez", PERSONAS)
    assert resultado.confianza == Confianza.ALTA
    assert resultado.mejor.persona_id == 1


def test_tolera_tildes_mayusculas_y_error_ortografico():
    for variante in ["sofia hernandez", "Sofia hernandes", "sofía hernández", "SOFIA HERNANDEZ MARTINEZ"]:
        resultado = buscar_candidatos(variante, PERSONAS)
        assert resultado.mejor.persona_id == 1, f"falló con variante: {variante}"


def test_nombre_incompleto_baja_a_media_o_encuentra_bien():
    resultado = buscar_candidatos("Sofia", PERSONAS)
    assert resultado.confianza in (Confianza.MEDIA, Confianza.ALTA)
    assert resultado.mejor.persona_id == 1


def test_orden_de_palabras_distinto_igual_encuentra():
    resultado = buscar_candidatos("Hernandez Martinez Sofia", PERSONAS)
    assert resultado.mejor.persona_id == 1


def test_query_sin_relacion_es_baja_confianza():
    resultado = buscar_candidatos("xzq nombre inventado", PERSONAS)
    assert resultado.confianza == Confianza.BAJA


def test_ambiguedad_nunca_es_alta_aunque_el_score_individual_lo_sea():
    """Caso 'Anthony': dos personas con nombres casi idénticos que el proyecto
    decidió NO fusionar por contradicciones reales (decisiones-diseño.md).
    El matching debe forzar confirmación manual, nunca elegir solo."""
    personas_con_ambiguedad = [
        (10, "MAR-000010", "Anthony de Jesus Bruges Gutierrez"),
        (11, "MAR-000011", "Anthony de Jesus Bruges Gutierrez"),
    ]
    resultado = buscar_candidatos("Anthony Bruges Gutierrez", personas_con_ambiguedad)
    assert resultado.confianza != Confianza.ALTA
    assert len(resultado.candidatos) >= 2


def test_lista_vacia_no_revienta():
    resultado = buscar_candidatos("cualquier nombre", [])
    assert resultado.confianza == Confianza.BAJA
    assert resultado.candidatos == []


def test_query_vacio_es_baja_confianza():
    resultado = buscar_candidatos("   ", PERSONAS)
    assert resultado.confianza == Confianza.BAJA
    assert resultado.candidatos == []
