from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_acceso_pastoral
from app.matching import buscar_candidatos
from app.models import AreaServicio, Persona, PersonaArea, Usuario
from app.schemas import (
    AreaServicioOut,
    FichaIncompletaOut,
    InvitacionRankingOut,
    MarcarServidorRequest,
    MatchResponse,
    PersonaAlertasOut,
    PersonaAreasUpdate,
    PersonaCreate,
    PersonaOut,
    PersonaUpdate,
)
from app.services.alertas_asistencia import calcular_inasistencias_consecutivas, calcular_semaforo
from app.services.bitacora import registrar_cambios
from app.services.identidad import siguiente_id_unico
from app.services.invitaciones import calcular_periodo, ranking_invitaciones

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("", response_model=list[PersonaOut])
def listar_personas(
    activo: bool | None = Query(default=True),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(Persona)
    if activo is not None:
        q = q.where(Persona.activo == activo)
    return db.scalars(q.order_by(Persona.apellidos, Persona.nombres)).all()


@router.get("/fichas-incompletas", response_model=list[FichaIncompletaOut])
def listar_fichas_incompletas(
    umbral: float | None = Query(
        default=None, description="Corte de % completitud; por defecto el de configuración"
    ),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Lista filtrable de fichas incompletas, ordenada por menor completitud
    primero (sección 17 del handoff). Nunca bloquea nada — es solo lectura."""
    corte = umbral if umbral is not None else settings.ficha_completa_umbral_porcentaje
    personas = db.scalars(select(Persona).where(Persona.activo == True)).all()  # noqa: E712
    incompletas = [p for p in personas if p.ficha_completa_pct < corte]
    incompletas.sort(key=lambda p: p.ficha_completa_pct)
    return incompletas


@router.get("/invitaciones-resumen", response_model=list[InvitacionRankingOut])
def invitaciones_resumen(
    periodo: str = Query(default="mes", pattern="^(mes|trimestre|semestre)$"),
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Ranking de quién invitó más jóvenes que se registraron en el período
    (pedido del usuario, 2026-08-10) — para reconocer a quien más trae gente
    nueva. La app solo cuenta y ordena; qué hacer con eso lo decide el
    equipo. Visible para todos los roles con sesión: es parte del trabajo
    del equipo de consolidación, no información pastoral sensible."""
    if desde and hasta:
        rango_desde, rango_hasta = desde, hasta
    else:
        rango_desde, rango_hasta = calcular_periodo(periodo)
    resultado = ranking_invitaciones(db, rango_desde, rango_hasta)
    return [InvitacionRankingOut(**r.__dict__) for r in resultado]


@router.get("/{persona_id}", response_model=PersonaOut)
def obtener_persona(persona_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    return persona


@router.get("/{persona_id}/alertas", response_model=PersonaAlertasOut)
def alertas_persona(persona_id: int, db: Session = Depends(get_db), _=Depends(require_acceso_pastoral)):
    """Alertas operativas de una persona: semáforo de asistencia (sección
    15/21 del handoff) + inasistencias consecutivas + ficha incompleta.
    Nunca es una conclusión pastoral — eso lo decide un humano. Solo
    admin/líder/encargado — no todo el equipo de consolidación."""
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    semaforo = calcular_semaforo(db, persona_id)
    return PersonaAlertasOut(
        id=persona.id,
        id_unico=persona.id_unico,
        nombre_completo=persona.nombre_completo,
        asistencias_ventana=semaforo.asistencias_ventana,
        reuniones_evaluables_ventana=semaforo.reuniones_evaluables_ventana,
        porcentaje_asistencia=semaforo.porcentaje,
        nivel_asistencia=semaforo.nivel,
        inasistencias_consecutivas=calcular_inasistencias_consecutivas(db, persona_id),
        ficha_completa_pct=persona.ficha_completa_pct,
        datos_faltantes=persona.datos_faltantes,
    )


@router.post("", response_model=PersonaOut, status_code=201)
def crear_persona(
    data: PersonaCreate, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)
):
    campos = data.model_dump()
    if campos.get("invitado_por_id") is not None and not db.get(Persona, campos["invitado_por_id"]):
        raise HTTPException(status_code=404, detail="La persona indicada como 'invitado_por' no existe")
    if campos.get("fecha_ingreso") is None:
        campos["fecha_ingreso"] = date.today()  # se registra sola: nadie tiene que acordarse de escribirla
    # registro_historico=False por defecto: esto es alguien nuevo, no un migrado del Excel.
    persona = Persona(id_unico=siguiente_id_unico(db), **campos)
    db.add(persona)
    db.flush()
    registrar_cambios(
        db,
        tabla="personas",
        registro_id=persona.id,
        usuario_id=usuario.id,
        cambios={"__creacion__": (None, persona.id_unico)},
    )
    db.commit()
    db.refresh(persona)
    return persona


@router.patch("/{persona_id}", response_model=PersonaOut)
def editar_persona(
    persona_id: int,
    data: PersonaUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    campos_nuevos = data.model_dump(exclude_unset=True)
    invitado_por_id = campos_nuevos.get("invitado_por_id")
    if invitado_por_id is not None:
        if invitado_por_id == persona_id:
            raise HTTPException(status_code=422, detail="Una persona no puede haberse invitado a sí misma")
        if not db.get(Persona, invitado_por_id):
            raise HTTPException(status_code=404, detail="La persona indicada como 'invitado_por' no existe")

    cambios = {}
    for campo, valor_nuevo in campos_nuevos.items():
        valor_anterior = getattr(persona, campo)
        if valor_anterior != valor_nuevo:
            cambios[campo] = (valor_anterior, valor_nuevo)
            setattr(persona, campo, valor_nuevo)

    if cambios:
        registrar_cambios(db, tabla="personas", registro_id=persona.id, usuario_id=usuario.id, cambios=cambios)
        db.commit()
        db.refresh(persona)
    return persona


@router.post("/{persona_id}/marcar-servidor", response_model=PersonaOut)
def marcar_nuevo_servidor(
    persona_id: int,
    data: MarcarServidorRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Para la reunión de servidores (STAFF): marca a un joven ya registrado
    como servidor y deja la fecha en que se integró. Si no se manda fecha,
    se usa hoy — pensado para tocar el nombre en la reunión y listo."""
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    nueva_fecha = data.fecha_inicio_servicio or date.today()
    registrar_cambios(
        db,
        tabla="personas",
        registro_id=persona.id,
        usuario_id=usuario.id,
        cambios={
            "servidor": (persona.servidor, True),
            "fecha_inicio_servicio": (persona.fecha_inicio_servicio, nueva_fecha),
        },
    )
    persona.servidor = True
    persona.fecha_inicio_servicio = nueva_fecha
    db.commit()
    db.refresh(persona)
    return persona


@router.put("/{persona_id}/areas", response_model=list[AreaServicioOut])
def actualizar_areas_servicio(
    persona_id: int,
    data: PersonaAreasUpdate,
    db: Session = Depends(get_db),
    _usuario: Usuario = Depends(get_current_user),
):
    """Reemplaza el conjunto completo de áreas en las que sirve la persona
    (selección múltiple desde la ficha). No borra el historial de
    asignaciones previas — las que ya no aplican quedan con activo=False."""
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    if data.area_ids:
        existentes = set(db.scalars(select(AreaServicio.id).where(AreaServicio.id.in_(data.area_ids))).all())
        faltantes = set(data.area_ids) - existentes
        if faltantes:
            raise HTTPException(status_code=404, detail=f"Área(s) de servicio no encontrada(s): {sorted(faltantes)}")

    seleccionadas = set(data.area_ids)
    asignaciones = db.scalars(select(PersonaArea).where(PersonaArea.persona_id == persona_id)).all()
    ya_asignadas = {a.area_servicio_id for a in asignaciones}

    for asignacion in asignaciones:
        asignacion.activo = asignacion.area_servicio_id in seleccionadas

    for area_id in seleccionadas - ya_asignadas:
        db.add(PersonaArea(persona_id=persona_id, area_servicio_id=area_id, fecha_inicio=date.today(), activo=True))

    db.commit()
    return db.scalars(
        select(AreaServicio)
        .join(PersonaArea, PersonaArea.area_servicio_id == AreaServicio.id)
        .where(PersonaArea.persona_id == persona_id, PersonaArea.activo == True)  # noqa: E712
        .order_by(AreaServicio.nombre)
    ).all()


@router.get("/buscar/coincidencias", response_model=MatchResponse)
def buscar_coincidencias(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Matching difuso para el flujo de asistencia: el líder escribe un nombre
    aproximado y esto devuelve candidatos con su nivel de confianza."""
    personas = db.execute(
        select(Persona.id, Persona.id_unico, Persona.nombres, Persona.apellidos).where(Persona.activo == True)  # noqa: E712
    ).all()
    tuplas = [(pid, id_unico, f"{nombres} {apellidos}") for pid, id_unico, nombres, apellidos in personas]
    resultado = buscar_candidatos(q, tuplas)
    return MatchResponse(
        confianza=resultado.confianza.value,
        candidatos=[c.__dict__ for c in resultado.candidatos],
    )
