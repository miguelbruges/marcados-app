"""Matching difuso de nombres de personas.

Objetivo: cuando un líder escribe un nombre a mano (con o sin tildes, mal
escrito, incompleto, en otro orden), sugerir candidatos de la tabla `Persona`
en vez de obligar a escribir el nombre exacto.

Regla dura del proyecto: esto sugiere, nunca decide. Si hay ambigüedad real
(dos candidatos con puntajes cercanos) el nivel de confianza baja a MEDIA o
BAJA aunque el mejor puntaje individual sea alto — la selección automática
silenciosa está prohibida en ese caso. El caso "Anthony" (dos registros que
no se pudieron fusionar por contradicciones reales) es el caso de prueba de
referencia para esta regla.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum

from rapidfuzz import fuzz

# Diferencia de puntaje por debajo de la cual dos candidatos se consideran
# "demasiado parecidos para decidir solos" y se fuerza selección manual.
AMBIGUITY_MARGIN = 5.0

UMBRAL_ALTA = 90.0
UMBRAL_MEDIA = 70.0


class Confianza(str, Enum):
    ALTA = "ALTA"
    MEDIA = "MEDIA"
    BAJA = "BAJA"


@dataclass(frozen=True)
class Candidato:
    persona_id: int
    id_unico: str
    nombre_completo: str
    score: float


@dataclass(frozen=True)
class ResultadoMatching:
    confianza: Confianza
    candidatos: list[Candidato]  # ordenados de mayor a menor score

    @property
    def mejor(self) -> Candidato | None:
        return self.candidatos[0] if self.candidatos else None


def normalizar(texto: str) -> str:
    """minúsculas, sin tildes, sin puntuación, espacios colapsados."""
    texto = texto.strip().lower()
    texto = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )
    texto = re.sub(r"[^a-z0-9\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto


def _score(query_norm: str, candidato_norm: str) -> float:
    # token_sort_ratio: no le importa el orden de las palabras (apellido antes
    # que nombre, etc). token_set_ratio: tolera nombres incompletos (falta un
    # apellido). Usamos el mejor de los dos porque cubren casos distintos.
    return max(
        fuzz.token_sort_ratio(query_norm, candidato_norm),
        fuzz.token_set_ratio(query_norm, candidato_norm),
    )


def buscar_candidatos(
    query: str,
    personas: list[tuple[int, str, str]],
    top_n: int = 5,
) -> ResultadoMatching:
    """personas: lista de (id, id_unico, nombre_completo)."""
    query_norm = normalizar(query)
    if not query_norm:
        return ResultadoMatching(confianza=Confianza.BAJA, candidatos=[])

    puntuados = [
        Candidato(persona_id=pid, id_unico=id_unico, nombre_completo=nombre, score=_score(query_norm, normalizar(nombre)))
        for pid, id_unico, nombre in personas
    ]
    puntuados.sort(key=lambda c: c.score, reverse=True)
    top = puntuados[:top_n]

    if not top or top[0].score < UMBRAL_MEDIA:
        return ResultadoMatching(confianza=Confianza.BAJA, candidatos=top)

    ambiguo = len(top) > 1 and (top[0].score - top[1].score) < AMBIGUITY_MARGIN and top[1].score >= UMBRAL_MEDIA

    if top[0].score >= UMBRAL_ALTA and not ambiguo:
        confianza = Confianza.ALTA
    else:
        confianza = Confianza.MEDIA

    return ResultadoMatching(confianza=confianza, candidatos=top)
