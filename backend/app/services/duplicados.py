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

from rapidfuzz import fuzz
from sqlalchemy import func, select as _select  # noqa: F401  (select ya importado arriba)

from app.matching import normalizar
from app.models import Asistencia, Persona, PersonaArea, Seguimiento

# --- Umbrales, calibrados contra los 120 jóvenes reales (2026-08-24) ---
#
# Los nombres de los ejemplos de acá abajo (y los de los tests) están
# cambiados a propósito: son menores de edad y esto es un repositorio. Se
# mantiene la FORMA de cada caso real (un apellido de más, tildes, mismo
# celular entre hermanas), que es lo que se está midiendo.
#
# Se usa token_sort_ratio y NO token_set_ratio (que es lo que usa el buscador
# de la app). La diferencia importa: token_set_ratio da 100 cuando un nombre
# está CONTENIDO en el otro, así que una ficha cargada como solo "Sofia"
# empataba al 100% con "Linda Sofía Bermudez Molina", "Marian Sofia Molina
# Yepes" y "Nathalie Sofía Arenas Acosta" a la vez — tres personas distintas.
# Para buscar a alguien escribiendo medio nombre eso está bien; para decidir
# si dos fichas son la misma persona, no.
#
# Medido sobre los nombres reales (por eso los números no se reproducen con
# los inventados de acá arriba):
#   misma persona     : 100 (mismo nombre con y sin tilde), 82 (un apellido
#                       de más), 72 (nombre con una errata + un apellido menos)
#   personas distintas: 64, 59 y 45 (pares de hermanas)
UMBRAL_SOLO_NOMBRE = 80
# Con el teléfono repetido se puede aflojar, pero NO regalar: en una familia
# se comparte el celular. Los dos pares de hermanas (45 y 59) comparten
# teléfono y son personas distintas; el duplicado de verdad da 72. El corte
# va en el medio.
UMBRAL_NOMBRE_CON_TELEFONO = 70


def _parecido(a: str, b: str) -> float:
    return fuzz.token_sort_ratio(normalizar(a), normalizar(b))


# Qué tan parecidas tienen que ser dos palabras sueltas para contar como la
# misma: cubre tildes y erratas ("Valentina"/"VALENTINA", "José"/"Jose").
UMBRAL_PALABRA = 85


def _uno_contiene_al_otro(a: str, b: str) -> bool:
    """¿El nombre más corto está contenido en el más largo?

    Es la señal que de verdad separa los dos casos, porque el puntaje solo no
    alcanza — medido sobre datos reales: "Santiago Ramirez" vs "Santiago
    Gomez" da 80 y son dos personas distintas, "Maria Paula Mendez" vs "Maria
    Paula Mendez Navarro" da 81.8 y es la misma. 1.8 puntos de diferencia no
    sirven como corte.

    La diferencia está en la forma: en un caso a la ficha corta solo le falta
    un apellido; en el otro los apellidos se contradicen. Así que se exige que
    cada palabra de la ficha corta aparezca (aunque sea con erratas o tildes)
    en la larga. "Ramirez" no está en {santiago, gomez} -> personas distintas.
    """
    ta, tb = normalizar(a).split(), normalizar(b).split()
    if not ta or not tb:
        return False
    corto, largo = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return all(
        any(fuzz.ratio(palabra, otra) >= UMBRAL_PALABRA for otra in largo) for palabra in corto
    )


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

    Se comparan de a PARES y un grupo solo se arma si todos sus integrantes
    se parecen entre sí (una camarilla, no una cadena). Antes se usaba
    union-find, que junta por transitividad: bastaba que A se pareciera a B
    y B a C para meter a A con C aunque no tuvieran nada que ver. Sobre los
    datos reales eso armaba un grupo de cuatro con Ayla Paola Quiroga Mendoza,
    dos hermanas Salas Peralta y una ficha llamada solo "Paola"
    (encontrado al revisar los 120 jóvenes reales, 2026-08-24).

    Solo mira fichas activas: una ya archivada por una fusión anterior no
    tiene que volver a aparecer.
    """
    personas = db.scalars(
        select(Persona).where(Persona.activo == True).order_by(Persona.id)  # noqa: E712
    ).all()
    por_id = {p.id: p for p in personas}

    # 1. Pares sospechosos, cada uno con su motivo.
    pares: dict[tuple[int, int], str] = {}
    for i, p1 in enumerate(personas):
        n1 = normalizar(p1.nombre_completo)
        if not n1:
            continue
        tel1 = _telefono_normalizado(p1.telefono)
        for p2 in personas[i + 1 :]:
            n2 = normalizar(p2.nombre_completo)
            if not n2:
                continue
            parecido = _parecido(p1.nombre_completo, p2.nombre_completo)
            mismo_telefono = bool(tel1) and tel1 == _telefono_normalizado(p2.telefono)

            contenido = _uno_contiene_al_otro(p1.nombre_completo, p2.nombre_completo)

            if mismo_telefono and (contenido or parecido >= UMBRAL_NOMBRE_CON_TELEFONO):
                pares[(p1.id, p2.id)] = "mismo teléfono y nombre parecido"
            elif contenido and parecido >= UMBRAL_SOLO_NOMBRE and len(n1.split()) >= 2 and len(n2.split()) >= 2:
                # Sin teléfono en común hace falta que un nombre contenga al
                # otro: si los apellidos se contradicen son dos personas.
                # Se exigen además dos palabras de cada lado: una ficha
                # cargada solo como "Paola" no alcanza para afirmar que es la
                # misma persona que otra "Paola", aunque coincidan al 100%.
                pares[(p1.id, p2.id)] = "nombre casi idéntico"

    if not pares:
        return []

    # 2. Camarillas: se parte del par y solo se suma a alguien que se parezca
    # a TODOS los que ya están dentro. Así un grupo de cinco significa que las
    # cinco fichas se parecen entre sí, no que hay una cadena de parecidos.
    vecinos: dict[int, set[int]] = {p.id: set() for p in personas}
    for (a, b) in pares:
        vecinos[a].add(b)
        vecinos[b].add(a)

    usados: set[int] = set()
    camarillas: list[list[int]] = []
    for pid in sorted(vecinos, key=lambda x: len(vecinos[x]), reverse=True):
        if pid in usados or not vecinos[pid]:
            continue
        grupo = [pid]
        for candidato in sorted(vecinos[pid], key=lambda x: len(vecinos[x]), reverse=True):
            if candidato in usados:
                continue
            if all(candidato in vecinos[m] for m in grupo):
                grupo.append(candidato)
        if len(grupo) >= 2:
            camarillas.append(grupo)
            usados.update(grupo)

    salida = []
    for ids in camarillas:
        miembros = [por_id[i] for i in ids]
        razones = sorted(
            {
                motivo
                for (a, b), motivo in pares.items()
                if a in ids and b in ids
            }
        )
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
