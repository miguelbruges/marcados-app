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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Actividad, Asistencia, Evento, Persona


@dataclass
class SemaforoAsistencia:
    asistencias_ventana: int
    reuniones_evaluables_ventana: int
    porcentaje: float | None  # 0-100, None si no hay reuniones evaluables en la ventana
    nivel: str  # "sin_datos" | "verde" | "amarillo" | "rojo"


def _nivel_por_fraccion(fraccion: float, umbral_verde: float, umbral_amarillo: float) -> str:
    if fraccion >= umbral_verde:
        return "verde"
    if fraccion >= umbral_amarillo:
        return "amarillo"
    return "rojo"


def _eventos_evaluables_ids(db: Session, desde: date) -> list[int]:
    """Eventos que cuentan como 'oportunidad de asistencia' dentro de la
    ventana — solo de actividades marcadas cuenta_para_semaforo=True (por
    defecto, el encuentro semanal principal). Este conjunto es el MISMO
    para todas las personas: el denominador del semáforo es "cuántas
    reuniones hubo", no "cuántas veces esta persona quedó registrada" —
    antes se calculaba así por error, y por eso una sola asistencia
    aislada aparecía como 100% / verde (pedido del usuario, 2026-08-12)."""
    return db.scalars(
        select(Evento.id)
        .join(Actividad, Actividad.id == Evento.actividad_id)
        .where(Evento.fecha >= desde, Evento.activo == True, Actividad.cuenta_para_semaforo == True)  # noqa: E712
    ).all()


def calcular_semaforo(
    db: Session,
    persona_id: int,
    ventana_dias: int | None = None,
    umbral_verde: float | None = None,
    umbral_amarillo: float | None = None,
    minimo_eventos: int | None = None,
) -> SemaforoAsistencia:
    ventana_dias = settings.alertas_ventana_dias if ventana_dias is None else ventana_dias
    umbral_verde = settings.alertas_umbral_verde if umbral_verde is None else umbral_verde
    umbral_amarillo = settings.alertas_umbral_amarillo if umbral_amarillo is None else umbral_amarillo
    minimo_eventos = settings.alertas_minimo_eventos if minimo_eventos is None else minimo_eventos
    desde = date.today() - timedelta(days=ventana_dias)

    evento_ids = _eventos_evaluables_ids(db, desde)
    evaluables = len(evento_ids)
    if evaluables < minimo_eventos:
        return SemaforoAsistencia(0, evaluables, None, "sin_datos")

    asistidas = (
        db.scalar(
            select(func.count())
            .select_from(Asistencia)
            .where(
                Asistencia.persona_id == persona_id,
                Asistencia.evento_id.in_(evento_ids),
                Asistencia.presente == True,  # noqa: E712
            )
        )
        or 0
    )
    fraccion = asistidas / evaluables
    nivel = _nivel_por_fraccion(fraccion, umbral_verde, umbral_amarillo)
    return SemaforoAsistencia(asistidas, evaluables, round(fraccion * 100, 1), nivel)


def calcular_inasistencias_consecutivas(db: Session, persona_id: int) -> int:
    """Cuenta las inasistencias seguidas más recientes (se corta apenas
    aparece una asistencia), mirando TODAS las reuniones contadas para el
    semáforo sin límite de ventana — es una racha, no un corte de tiempo."""
    eventos = db.scalars(
        select(Evento.id)
        .join(Actividad, Actividad.id == Evento.actividad_id)
        .where(Evento.activo == True, Actividad.cuenta_para_semaforo == True)  # noqa: E712
        .order_by(Evento.fecha.desc())
    ).all()
    if not eventos:
        return 0

    asistidos = set(
        db.scalars(
            select(Asistencia.evento_id).where(
                Asistencia.persona_id == persona_id,
                Asistencia.evento_id.in_(eventos),
                Asistencia.presente == True,  # noqa: E712
            )
        ).all()
    )
    consecutivas = 0
    for evento_id in eventos:
        if evento_id in asistidos:
            break
        consecutivas += 1
    return consecutivas


def calcular_niveles_todas(
    db: Session,
    ventana_dias: int | None = None,
    umbral_verde: float | None = None,
    umbral_amarillo: float | None = None,
    minimo_eventos: int | None = None,
) -> dict[int, SemaforoAsistencia]:
    """Semáforo de TODAS las personas activas en una sola consulta — evitar
    correr calcular_semaforo() persona por persona (N+1) importa de verdad
    acá: con la base en Supabase, cada consulta es un viaje de red, y
    120 viajes hacían que el panel tardara notoriamente en cargar.

    El denominador (evaluables) es el MISMO para todas: cuántas reuniones
    contadas para el semáforo hubo en la ventana. Quien no asistió a
    ninguna de esas reuniones da 0% ("rojo"), no "sin_datos" — "sin_datos"
    ahora solo significa que todavía no hubo suficientes reuniones para
    evaluar a nadie, no que a esta persona en particular le falte historial."""
    ventana_dias = settings.alertas_ventana_dias if ventana_dias is None else ventana_dias
    umbral_verde = settings.alertas_umbral_verde if umbral_verde is None else umbral_verde
    umbral_amarillo = settings.alertas_umbral_amarillo if umbral_amarillo is None else umbral_amarillo
    minimo_eventos = settings.alertas_minimo_eventos if minimo_eventos is None else minimo_eventos
    desde = date.today() - timedelta(days=ventana_dias)

    ids_activos = db.scalars(select(Persona.id).where(Persona.activo == True)).all()  # noqa: E712
    evento_ids = _eventos_evaluables_ids(db, desde)
    evaluables = len(evento_ids)

    if evaluables < minimo_eventos:
        return {pid: SemaforoAsistencia(0, evaluables, None, "sin_datos") for pid in ids_activos}

    filas = db.execute(
        select(Asistencia.persona_id, func.count())
        .where(
            Asistencia.evento_id.in_(evento_ids),
            Asistencia.persona_id.in_(ids_activos),
            Asistencia.presente == True,  # noqa: E712
        )
        .group_by(Asistencia.persona_id)
    ).all()
    contador = dict(filas)

    resultado: dict[int, SemaforoAsistencia] = {}
    for persona_id in ids_activos:
        asistidas = contador.get(persona_id, 0)
        fraccion = asistidas / evaluables
        nivel = _nivel_por_fraccion(fraccion, umbral_verde, umbral_amarillo)
        resultado[persona_id] = SemaforoAsistencia(asistidas, evaluables, round(fraccion * 100, 1), nivel)
    return resultado


def resumen_niveles(
    db: Session,
    ventana_dias: int | None = None,
    umbral_verde: float | None = None,
    umbral_amarillo: float | None = None,
) -> dict[str, int]:
    """Cuenta cuántas personas activas caen en cada nivel del semáforo de
    asistencia — para el panel y, más adelante, el bot de Telegram de solo
    consulta (sección 19: '¿cuántos jóvenes en rojo?')."""
    conteo = {"verde": 0, "amarillo": 0, "rojo": 0, "sin_datos": 0}
    for s in calcular_niveles_todas(db, ventana_dias, umbral_verde, umbral_amarillo).values():
        conteo[s.nivel] += 1
    return conteo


def personas_por_nivel(
    db: Session,
    nivel: str,
    ventana_dias: int | None = None,
    umbral_verde: float | None = None,
    umbral_amarillo: float | None = None,
) -> list[Persona]:
    """Lista de personas detrás de una pastilla del semáforo — para poder
    abrirla y ver quiénes son, no solo cuántos."""
    niveles = calcular_niveles_todas(db, ventana_dias, umbral_verde, umbral_amarillo)
    ids = [pid for pid, s in niveles.items() if s.nivel == nivel]
    if not ids:
        return []
    return db.scalars(
        select(Persona).where(Persona.id.in_(ids)).order_by(Persona.apellidos, Persona.nombres)
    ).all()
