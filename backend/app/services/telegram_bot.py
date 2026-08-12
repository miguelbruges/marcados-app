"""Bot de Telegram de solo consulta (sección 19 del handoff).

Solo lectura a propósito — ningún comando registra asistencia, marca
servidores ni cambia nada. El bot nunca tiene credenciales propias: cada
chat se vincula a un Usuario ya existente de MARCADOS vía /login, y a
partir de ahí respeta exactamente el mismo rol/permisos que esa persona ya
tiene en la app (nunca más acceso del que ya tenía, sección 20). El
semáforo espiritual NUNCA se expone acá, ni siquiera a quien sí tendría
acceso pastoral en la app — es un dato manual, sensible, para verse y
discutirse en persona, no para mandarse por chat.

`procesar_mensaje` es una función pura (recibe texto, devuelve texto) para
poder probarla sin mockear la API HTTP de Telegram — el router del webhook
es la única parte que de verdad habla con Telegram.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import ROLES_CON_ACCESO_PASTORAL
from app.matching import buscar_candidatos
from app.models import Asistencia, Evento, Persona, TelegramSesion, Usuario
from app.security import verify_password
from app.services.alertas_asistencia import resumen_niveles

TEXTO_AYUDA = (
    "MARCADOS — bot de solo consulta. No registra nada, solo responde.\n\n"
    "/login tu_email tu_contraseña — vincula este chat con tu usuario de la app\n"
    "/logout — cierra la sesión de este chat\n"
    "/resumen — total de jóvenes, activos, bautizados, sirviendo\n"
    "/semaforo — cuántos en verde/amarillo/rojo/sin datos (solo líderes y encargados)\n"
    "/incompletas — cuántas fichas están incompletas\n"
    "/buscar nombre — busca a un joven por nombre\n"
    "/ayuda — este mensaje"
)


def _usuario_de_sesion(db: Session, chat_id: str) -> Usuario | None:
    sesion = db.scalar(select(TelegramSesion).where(TelegramSesion.chat_id == chat_id))
    if not sesion:
        return None
    usuario = db.get(Usuario, sesion.usuario_id)
    return usuario if usuario and usuario.activo else None


def _login(db: Session, chat_id: str, email: str, password: str) -> str:
    email = email.strip().lower()
    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if not usuario or not usuario.activo or not verify_password(password, usuario.password_hash):
        return "Email o contraseña incorrectos."

    sesion = db.scalar(select(TelegramSesion).where(TelegramSesion.chat_id == chat_id))
    if sesion:
        sesion.usuario_id = usuario.id
    else:
        db.add(TelegramSesion(chat_id=chat_id, usuario_id=usuario.id))
    db.commit()
    return f"Listo, {usuario.nombre}. Sesión iniciada como {usuario.rol.value}. Escribí /ayuda para ver qué podés consultar."


def _logout(db: Session, chat_id: str) -> str:
    sesion = db.scalar(select(TelegramSesion).where(TelegramSesion.chat_id == chat_id))
    if not sesion:
        return "Este chat no tenía una sesión iniciada."
    db.delete(sesion)
    db.commit()
    return "Sesión cerrada."


def _resumen(db: Session) -> str:
    total = db.scalar(select(func.count()).select_from(Persona)) or 0
    activos = db.scalar(select(func.count()).select_from(Persona).where(Persona.activo == True)) or 0  # noqa: E712
    bautizados = db.scalar(select(func.count()).select_from(Persona).where(Persona.bautizado == True)) or 0  # noqa: E712
    sirviendo = db.scalar(select(func.count()).select_from(Persona).where(Persona.servidor == True)) or 0  # noqa: E712
    hace_30 = date.today() - timedelta(days=30)
    asistieron_30d = (
        db.scalar(
            select(func.count(func.distinct(Asistencia.persona_id)))
            .select_from(Asistencia)
            .join(Evento, Evento.id == Asistencia.evento_id)
            .where(Evento.fecha >= hace_30, Asistencia.presente == True)  # noqa: E712
        )
        or 0
    )
    return (
        f"Total jóvenes: {total}\n"
        f"Activos: {activos}\n"
        f"Bautizados: {bautizados}\n"
        f"Sirviendo: {sirviendo}\n"
        f"Asistieron últimos 30 días: {asistieron_30d}"
    )


def _semaforo(db: Session) -> str:
    resumen = resumen_niveles(db)
    return (
        "Semáforo de asistencia (30 días) — alerta operativa, no una conclusión pastoral:\n"
        f"🟢 Verde: {resumen['verde']}\n"
        f"🟡 Amarillo: {resumen['amarillo']}\n"
        f"🔴 Rojo: {resumen['rojo']}\n"
        f"⚪ Sin datos: {resumen['sin_datos']}"
    )


def _incompletas(db: Session) -> str:
    corte = settings.ficha_completa_umbral_porcentaje
    personas = db.scalars(select(Persona).where(Persona.activo == True)).all()  # noqa: E712
    incompletas = [p for p in personas if p.ficha_completa_pct < corte]
    if not incompletas:
        return "Ninguna ficha activa está por debajo del umbral configurado."
    incompletas.sort(key=lambda p: p.ficha_completa_pct)
    primeras = incompletas[:10]
    lineas = [f"{p.nombre_completo} — {p.ficha_completa_pct}%" for p in primeras]
    extra = f"\n… y {len(incompletas) - 10} más." if len(incompletas) > 10 else ""
    return f"Fichas incompletas ({len(incompletas)}):\n" + "\n".join(lineas) + extra


def _buscar(db: Session, texto: str) -> str:
    personas = db.execute(
        select(Persona.id, Persona.id_unico, Persona.nombres, Persona.apellidos).where(Persona.activo == True)  # noqa: E712
    ).all()
    tuplas = [(pid, id_unico, f"{nombres} {apellidos}") for pid, id_unico, nombres, apellidos in personas]
    resultado = buscar_candidatos(texto, tuplas)
    if not resultado.candidatos:
        return "Sin coincidencias."
    lineas = [f"{c.nombre_completo} ({c.id_unico})" for c in resultado.candidatos]
    return "\n".join(lineas)


def procesar_mensaje(db: Session, chat_id: str, texto: str) -> str:
    texto = (texto or "").strip()
    if not texto:
        return TEXTO_AYUDA

    partes = texto.split(maxsplit=2)
    comando = partes[0].lower().split("@")[0]  # /comando@NombreDelBot -> /comando

    if comando in ("/start", "/ayuda", "/help"):
        return TEXTO_AYUDA

    if comando == "/login":
        if len(partes) < 3:
            return "Uso: /login tu_email tu_contraseña"
        return _login(db, chat_id, partes[1], partes[2])

    if comando == "/logout":
        return _logout(db, chat_id)

    usuario = _usuario_de_sesion(db, chat_id)
    if not usuario:
        return "Primero iniciá sesión: /login tu_email tu_contraseña"

    if comando in ("/resumen", "/panel"):
        return _resumen(db)

    if comando == "/semaforo":
        if usuario.rol.value not in ROLES_CON_ACCESO_PASTORAL:
            return "Esta consulta es solo para líderes y encargados."
        return _semaforo(db)

    if comando == "/incompletas":
        return _incompletas(db)

    if comando == "/buscar":
        if len(partes) < 2:
            return "Uso: /buscar nombre del joven"
        return _buscar(db, " ".join(partes[1:]))

    return "No entendí ese comando. Escribí /ayuda para ver las opciones."
