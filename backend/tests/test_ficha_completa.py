from datetime import date

from app.models import Persona
from app.services.ficha_completa import calcular_ficha_completa


def _persona_completa() -> Persona:
    return Persona(
        id_unico="MAR-000001",
        nombres="Sofia",
        apellidos="Hernandez",
        genero="Femenino",
        fecha_nacimiento=date(2008, 1, 1),
        estado="Activo",
        bautizado=True,
        telefono="3000000000",
        direccion="Calle 1",
        contacto_emergencia="Maria Hernandez",
        parentesco="Madre",
        telefono_emergencia="3001111111",
        grupo_sanguineo="O+",
        eps="Sanitas",
        fecha_ingreso=date(2024, 1, 1),
    )


def test_ficha_completa_100_por_ciento_sin_campos_faltantes():
    pct, faltantes = calcular_ficha_completa(_persona_completa())
    assert pct == 100.0
    assert faltantes == []


def test_ficha_completa_detecta_campos_vacios_y_espacios_en_blanco():
    persona = _persona_completa()
    persona.direccion = None
    persona.telefono_emergencia = "   "  # solo espacios cuenta como vacío

    pct, faltantes = calcular_ficha_completa(persona)
    assert "Dirección" in faltantes
    assert "Teléfono de emergencia" in faltantes
    assert pct == round(12 / 14 * 100, 1)


def test_ficha_completa_persona_sin_ningun_campo_clave():
    # bautizado explicito (False) simula el estado ya persistido: en la BD
    # es NOT NULL, así que siempre cuenta como "presente" una vez guardado.
    persona = Persona(id_unico="MAR-000002", nombres="X", apellidos="", bautizado=False)
    pct, faltantes = calcular_ficha_completa(persona)
    assert "Nombres" not in faltantes
    assert "Apellidos" in faltantes
    assert "Bautizado" not in faltantes
    assert pct < 100.0
