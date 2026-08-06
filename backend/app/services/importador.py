"""Parseo de listas de asistencia pegadas a mano (formato típico de WhatsApp).

Ejemplo real que el ministerio usa:

    asistencia culto juvenil 25/07/2026
    Sofia Hernandez
    Camila Rodriguez
    Jose David Muñoz

Esto solo separa el texto en nombres candidatos — no decide nada por su
cuenta. El matching y la confirmación humana pasan después, en el router.
"""

from __future__ import annotations

import re

_PATRON_ENCABEZADO = re.compile(r"\basistencia\b", re.IGNORECASE)
_TIENE_LETRAS = re.compile(r"[a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,}")


def parecen_nombre(linea: str) -> bool:
    """Filtra líneas que claramente no son un nombre: vacías, encabezados
    tipo 'asistencia culto juvenil 25/07/2026', o sin letras suficientes."""
    if not linea.strip():
        return False
    if _PATRON_ENCABEZADO.search(linea):
        return False
    return bool(_TIENE_LETRAS.search(linea))


def parsear_lista(texto: str) -> list[str]:
    """Devuelve las líneas que parecen nombres, en el orden en que aparecen."""
    return [linea.strip() for linea in texto.splitlines() if parecen_nombre(linea)]
