"""Completitud de la ficha de una Persona — replica la lógica de las
columnas 'Ficha completa (%)' y 'Datos faltantes' del Excel original
(sección 17 del handoff). Los 14 campos clave y el corte de "incompleta"
son configurables (ver app.config), no constantes de negocio enterradas
en el código.

Nota sobre 'Bautizado': en la base es un booleano obligatorio (no nullable),
así que siempre cuenta como "presente". De los 120 registros migrados solo
uno (MAR-000052) no traía ese dato en el Excel; se documenta acá en vez de
forzar un booleano opcional en todo el sistema por un único caso histórico.
"""

from __future__ import annotations

from app.models import Persona

CAMPOS_CLAVE: list[tuple[str, str]] = [
    ("nombres", "Nombres"),
    ("apellidos", "Apellidos"),
    ("genero", "Género"),
    ("fecha_nacimiento", "Fecha de nacimiento"),
    ("estado", "Estado"),
    ("bautizado", "Bautizado"),
    ("telefono", "Teléfono"),
    ("direccion", "Dirección"),
    ("contacto_emergencia", "Contacto de emergencia"),
    ("parentesco", "Parentesco"),
    ("telefono_emergencia", "Teléfono de emergencia"),
    ("grupo_sanguineo", "Grupo sanguíneo"),
    ("eps", "EPS"),
    ("fecha_ingreso", "Fecha de ingreso al grupo"),
]


def _esta_lleno(valor) -> bool:
    if valor is None:
        return False
    if isinstance(valor, bool):
        return True  # un booleano siempre tiene un valor definido
    if isinstance(valor, str):
        return bool(valor.strip())
    return True


def calcular_ficha_completa(persona: Persona) -> tuple[float, list[str]]:
    """Devuelve (porcentaje 0-100, lista de nombres de campos faltantes),
    en el mismo orden que las columnas AK/AL del Excel."""
    faltantes = [etiqueta for campo, etiqueta in CAMPOS_CLAVE if not _esta_lleno(getattr(persona, campo))]
    llenos = len(CAMPOS_CLAVE) - len(faltantes)
    porcentaje = round(llenos / len(CAMPOS_CLAVE) * 100, 1)
    return porcentaje, faltantes
