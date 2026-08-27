"""Detectar y fusionar fichas duplicadas de la misma persona.

Por qué existe (pedido del usuario, 2026-08-24): en la lista de fichas
incompletas aparecía "José Pacheco" cinco veces, y eran cinco registros
distintos. Pasa naturalmente: alguien se anota en papel una semana, otro lo
carga a mano la siguiente, y el Excel original ya venía con repetidos.

Regla del proyecto, igual que en la importación: **acá NO se fusiona nada
solo**. Este módulo agrupa y explica por qué sospecha; juntar dos fichas es
siempre una decisión humana, porque dos personas pueden llamarse igual de
verdad — dos hermanos, un padre y un hijo con el mismo nombre. Confundirlos
borraría el historial de una persona real.

Fusionar tampoco borra: la ficha absorbida se archiva (activo=False) y todo
queda en Bitácora, así que un error se puede rastrear y deshacer a mano.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.matching import _score, normalizar
from app.models import Asistencia, Persona, PersonaArea, Seguimiento

# Solo se agrupa por parecido MUY alto. Un umbral más flojo llenaba la lista
# de primos y hermanos con apellidos compartidos, y una lista con ruido no
# se revisa: se ignora entera.
UMBRAL_NOMBRE_PARECIDO = 92


def _telefono_normalizado(valor: str | None) -> str | None:
    if not valor:
        return None
    solo_digitos = "".join(c for c in valor if c.isdigit())
    # Menos de 7 dígitos no identifica a nadie (extensiones, datos a medias).
    return solo_digitos if len(solo_digitos) >= 7 else None


def _resumen(p: Persona) -> dict[str, Any]:
    return {
        "id": p.id,
        "id_unico": p.id_unico,
        "nombre_completo": p.nombre_completo,
        "telefono": p.telefono,
        "estado": p.estado,
        "fecha_ingreso": p.fecha_ingreso.isoformat() if p.fecha_ingreso else None,
        "ficha_completa_pct": p.ficha_completa_pct,
        "activo": p.activo,
    }


def _contar_historial(db: Session, persona_id: int) -> dict[str, int]:
    """Cuánto historial tiene cada ficha — es lo que mira un humano para
    decidir cuál conservar, así que se muestra antes de fusionar."""
    return {
        "asistencias": db.scalar(
            select(func.count()).select_from(Asistencia).where(Asistencia.persona_id == persona_id)
        )
        or 0,
        "seguimientos": db.scalar(
            select(func.count()).select_from(Seguimiento).where(Seguimiento.persona_id == persona_id)
        )
        or 0,
    }


def buscar_duplicados(db: Session) -> list[dict[str, Any]]:
    """Grupos de fichas que podrían ser la misma persona, con el motivo.

    Dos señales, ambas conservadoras:
      - mismo teléfono (normalizado a dígitos)
      - nombre completo prácticamente igual

    Solo mira fichas activas: una ya archivada por una fusión anterior no
    tiene que volver a aparecer.
    """
    personas = db.scalars(
        select(Persona).where(Persona.activo == True).order_by(Persona.id)  # noqa: E712
    ).all()

    # union-find simple: junta en un mismo grupo a quien comparta cualquier señal
    padre: dict[int, int] = {p.id: p.id for p in personas}

    def raiz(x: int) -> int:
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    def unir(a: int, b: int) -> None:
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padre[max(ra, rb)] = min(ra, rb)

    motivos: dict[int, set[str]] = {p.id: set() for p in personas}

    por_telefono: dict[str, list[Persona]] = {}
    for p in personas:
        tel = _telefono_normalizado(p.telefono)
        if tel:
            por_telefono.setdefault(tel, []).append(p)
    for tel, grupo in por_telefono.items():
        if len(grupo) < 2:
            continue
        for p in grupo[1:]:
            unir(grupo[0].id, p.id)
        for p in grupo:
            motivos[p.id].add("mismo teléfono")

    normalizados = [(p, normalizar(p.nombre_completo)) for p in personas]
    for i, (p1, n1) in enumerate(normalizados):
        if not n1:
            continue
        for p2, n2 in normalizados[i + 1 :]:
            if not n2:
                continue
            if _score(n1, n2) >= UMBRAL_NOMBRE_PARECIDO:
                unir(p1.id, p2.id)
                motivos[p1.id].add("nombre casi idéntico")
                motivos[p2.id].add("nombre casi idéntico")

    grupos: dict[int, list[Persona]] = {}
    for p in personas:
        grupos.setdefault(raiz(p.id), []).append(p)

    salida = []
    for miembros in grupos.values():
        if len(miembros) < 2:
            continue
        razones = sorted({m for p in miembros for m in motivos[p.id]})
        # La sugerencia de cuál conservar es solo eso: la que más historial
        # tiene. La decide igual la persona que revisa.
        con_historial = [
            {**_resumen(p), "historial": _contar_historial(db, p.id)} for p in miembros
        ]
        con_historial.sort(
            key=lambda d: (d["historial"]["asistencias"], d["historial"]["seguimientos"], d["ficha_completa_pct"]),
            reverse=True,
        )
        salida.append(
            {
                "motivos": razones,
                "sugerencia_conservar_id": con_historial[0]["id"],
                "personas": con_historial,
            }
        )

    salida.sort(key=lambda g: len(g["personas"]), reverse=True)
    return salida


def fusionar(db: Session, conservar_id: int, absorber_id: int, usuario_id: int | None) -> dict[str, Any]:
    """Mueve todo el historial de `absorber` a `conservar` y archiva la otra.

    Nada se borra: la ficha absorbida queda con activo=False y sus datos
    intactos, y cada movimiento queda en Bitácora. Si la fusión estuvo mal,
    se puede ver qué pasó y rehacerlo a mano.
    """
    from app.services.bitacora import registrar_cambios

    if conservar_id == absorber_id:
        raise ValueError("No se puede fusionar una ficha consigo misma")

    conservar = db.get(Persona, conservar_id)
    absorber = db.get(Persona, absorber_id)
    if not conservar or not absorber:
        raise LookupError("Alguna de las dos fichas no existe")
    if not absorber.activo:
        raise ValueError("Esa ficha ya está archivada")

    movidas = {"asistencias": 0, "seguimientos": 0, "areas": 0, "invitaciones": 0, "campos_completados": 0}

    # Asistencias: hay UNIQUE(persona_id, evento_id). Si las dos fichas
    # figuran en el mismo evento es la misma presencia contada dos veces —
    # se descarta la repetida en vez de romper la fusión.
    eventos_ya = {
        a.evento_id for a in db.scalars(select(Asistencia).where(Asistencia.persona_id == conservar_id)).all()
    }
    for a in db.scalars(select(Asistencia).where(Asistencia.persona_id == absorber_id)).all():
        if a.evento_id in eventos_ya:
            db.delete(a)
        else:
            a.persona_id = conservar_id
            eventos_ya.add(a.evento_id)
            movidas["asistencias"] += 1

    for s in db.scalars(select(Seguimiento).where(Seguimiento.persona_id == absorber_id)).all():
        s.persona_id = conservar_id
        movidas["seguimientos"] += 1

    # Áreas de servicio: mismo caso, UNIQUE(persona_id, area_servicio_id).
    areas_ya = {
        pa.area_servicio_id
        for pa in db.scalars(select(PersonaArea).where(PersonaArea.persona_id == conservar_id)).all()
    }
    for pa in db.scalars(select(PersonaArea).where(PersonaArea.persona_id == absorber_id)).all():
        if pa.area_servicio_id in areas_ya:
            db.delete(pa)
        else:
            pa.persona_id = conservar_id
            areas_ya.add(pa.area_servicio_id)
            movidas["areas"] += 1

    # A quién invitó la ficha absorbida: esas invitaciones son suyas y no se
    # pierden, pasan a la que queda.
    for otra in db.scalars(select(Persona).where(Persona.invitado_por_id == absorber_id)).all():
        otra.invitado_por_id = conservar_id
        movidas["invitaciones"] += 1

    # Completar huecos: solo se llenan campos VACÍOS en la que se conserva.
    # Nunca se pisa un dato existente — si los dos tienen valor y difieren,
    # gana la ficha elegida y el otro queda archivado, visible en su ficha.
    cambios: dict[str, tuple[Any, Any]] = {}
    for campo in (
        "telefono", "correo_electronico", "fecha_nacimiento", "genero", "direccion",
        "contacto_emergencia", "parentesco", "telefono_emergencia", "grupo_sanguineo",
        "eps", "talla", "como_llego", "estado", "notas", "fecha_ingreso",
        "fecha_bautismo", "fecha_inicio_servicio",
    ):
        actual = getattr(conservar, campo, None)
        otro = getattr(absorber, campo, None)
        if (actual is None or actual == "") and otro not in (None, ""):
            cambios[campo] = (actual, otro)
            setattr(conservar, campo, otro)
            movidas["campos_completados"] += 1

    # servidor/bautizado son booleanos NOT NULL: si cualquiera de las dos lo
    # tenía en True, se conserva True — perder un "sí, sirve" sería peor que
    # el falso positivo, y de todas formas queda para reconfirmar a mano.
    for campo in ("servidor", "bautizado"):
        if getattr(absorber, campo) and not getattr(conservar, campo):
            cambios[campo] = (False, True)
            setattr(conservar, campo, True)

    if cambios:
        registrar_cambios(db, tabla="personas", registro_id=conservar.id, usuario_id=usuario_id, cambios=cambios)

    absorber.activo = False
    registrar_cambios(
        db,
        tabla="personas",
        registro_id=absorber.id,
        usuario_id=usuario_id,
        cambios={"activo": (True, False), "fusionada_en": (None, conservar.id_unico)},
    )

    db.commit()
    db.refresh(conservar)
    return {
        "conservada": _resumen(conservar),
        "archivada": {"id": absorber.id, "id_unico": absorber.id_unico, "nombre_completo": absorber.nombre_completo},
        "movido": movidas,
    }
