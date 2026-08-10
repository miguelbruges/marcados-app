"""Alertas OPERATIVAS de asistencia — replica la lógica del 'Semáforo de
asistencia' del Excel real (columnas AG-AJ de la hoja Jóvenes, sección 15
del handoff) y agrega inasistencias consecutivas (sección 20).

Regla no negociable del proyecto (sección 21): esto detecta, clasifica y
prioriza. NUNCA es una conclusión espiritual ni pastoral — esa decisión la
toma una persona. Por eso este semáforo es un campo aparte del
'semaforo_espiritual' manual de Persona, y nunca se llama igual.

Nota sobre 'reuniones evaluables': el Excel distingue 3 estados de
asistencia (Asistió/Inasistió/Excusa, catálogo CatAsistencia) y excluye las
excusas del denominador. El modelo actual solo registra presente/ausente
— no existe todavía el estado "excusa" — así que 'reuniones evaluables'
cuenta todos los registros de asistencia dentro de la ventana. Se
documenta acá en vez de inventar un estado que la app no captura.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Asistencia, Evento, Persona


@dataclass
class SemaforoAsistencia:
    asistencias_ventana: int
    reuniones_evaluables_ventana: int
    porcentaje: float | None  # 0-100, None si no hay reuniones evaluables en la ventana
    nivel: str  # "sin_datos" | "verde" | "amarillo" | "rojo"


def calcular_semaforo(db: Session, persona_id: int) -> SemaforoAsistencia:
    desde = date.today() - timedelta(days=settings.alertas_ventana_dias)
    registros = db.scalars(
        select(Asistencia).join(Evento).where(Asistencia.persona_id == persona_id, Evento.fecha >= desde)
    ).all()

    evaluables = len(registros)
    asistidas = sum(1 for r in registros if r.presente)

    if evaluables == 0:
        return SemaforoAsistencia(asistidas, evaluables, None, "sin_datos")

    fraccion = asistidas / evaluables
    if fraccion >= settings.alertas_umbral_verde:
        nivel = "verde"
    elif fraccion >= settings.alertas_umbral_amarillo:
        nivel = "amarillo"
    else:
        nivel = "rojo"
    return SemaforoAsistencia(asistidas, evaluables, round(fraccion * 100, 1), nivel)


def calcular_inasistencias_consecutivas(db: Session, persona_id: int) -> int:
    """Cuenta las inasistencias seguidas más recientes (se corta apenas
    aparece una asistencia). No mira una ventana de tiempo: mira la racha."""
    registros = db.scalars(
        select(Asistencia).join(Evento).where(Asistencia.persona_id == persona_id).order_by(Evento.fecha.desc())
    ).all()
    consecutivas = 0
    for r in registros:
        if r.presente:
            break
        consecutivas += 1
    return consecutivas


def resumen_niveles(db: Session) -> dict[str, int]:
    """Cuenta cuántas personas activas caen en cada nivel del semáforo de
    asistencia — para el panel y, más adelante, el bot de Telegram de solo
    consulta (sección 19: '¿cuántos jóvenes en rojo?')."""
    conteo = {"verde": 0, "amarillo": 0, "rojo": 0, "sin_datos": 0}
    personas = db.scalars(select(Persona.id).where(Persona.activo == True)).all()  # noqa: E712
    for persona_id in personas:
        conteo[calcular_semaforo(db, persona_id).nivel] += 1
    return conteo
