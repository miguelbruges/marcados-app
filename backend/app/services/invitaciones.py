"""Ranking de quién invitó más jóvenes nuevos en un período — pedido del
usuario (2026-08-10) para poder reconocer a quien más trae gente nueva al
grupo. La app solo cuenta y ordena; qué hacer con ese dato (un regalo, una
mención, nada) lo decide el equipo, no el sistema.

Cuenta personas con 'invitado_por_id' definido cuya 'fecha_ingreso' cae en
el período — por eso solo aplica a personas registradas desde la app en
adelante (los 120 migrados del Excel no tienen fecha_ingreso ni este campo,
ver Persona.registro_historico)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Persona

PERIODOS_VALIDOS = {"mes", "trimestre", "semestre"}


@dataclass
class InvitacionRanking:
    persona_id: int
    id_unico: str
    nombre_completo: str
    cantidad: int


def calcular_periodo(periodo: str, hoy: date | None = None) -> tuple[date, date]:
    """Rango [primer día del período corriente, hoy]. No es una ventana
    móvil de N días: es el mes/trimestre/semestre calendario en curso."""
    if periodo not in PERIODOS_VALIDOS:
        raise ValueError(f"Período inválido: {periodo!r}. Válidos: {sorted(PERIODOS_VALIDOS)}")
    hoy = hoy or date.today()
    if periodo == "mes":
        desde = hoy.replace(day=1)
    elif periodo == "trimestre":
        primer_mes = (hoy.month - 1) // 3 * 3 + 1
        desde = hoy.replace(month=primer_mes, day=1)
    else:  # semestre
        primer_mes = 1 if hoy.month <= 6 else 7
        desde = hoy.replace(month=primer_mes, day=1)
    return desde, hoy


def ranking_invitaciones(db: Session, desde: date, hasta: date) -> list[InvitacionRanking]:
    nuevos = db.scalars(
        select(Persona).where(
            Persona.invitado_por_id.is_not(None),
            Persona.fecha_ingreso >= desde,
            Persona.fecha_ingreso <= hasta,
        )
    ).all()
    if not nuevos:
        return []

    conteos: dict[int, int] = {}
    for p in nuevos:
        conteos[p.invitado_por_id] = conteos.get(p.invitado_por_id, 0) + 1

    invitadores = {p.id: p for p in db.scalars(select(Persona).where(Persona.id.in_(conteos.keys()))).all()}
    resultado = [
        InvitacionRanking(
            persona_id=pid, id_unico=invitadores[pid].id_unico, nombre_completo=invitadores[pid].nombre_completo, cantidad=cant
        )
        for pid, cant in conteos.items()
        if pid in invitadores  # por si el invitador fue desactivado/borrado en algún momento
    ]
    resultado.sort(key=lambda r: (-r.cantidad, r.nombre_completo))
    return resultado
