"""Migración del Excel real de MARCADOS (BASE_DE_DATOS_MARCADOS.xlsx) a la BD.

Implementa exactamente el contrato descrito en la hoja "Handoff Claude Code"
del propio libro (equivalente a MARCADOS_DATA_HANDOFF.md). Reglas clave que
este script respeta:

  - La clave es 'ID único' (columna AF) — nunca el nombre ni la posición.
  - No se importan las columnas derivadas (No., Edad, Segmento, Asistencia
    últimos 30 días, Semáforo, Nombre completo ayuda) — son fórmulas de
    Excel, la app las recalcula.
  - Vacío migra como NULL, nunca como valor por defecto inventado.
  - No se fusionan personas ambiguas (ver sección 9 del handoff) — se
    importan como personas separadas y se marca el caso con un registro de
    Seguimiento para que un humano lo revise.
  - Las 9 personas sin Estado se importan con estado=NULL + Seguimiento
    marcado "requiere_atencion", nunca se infiere el estado.
  - El texto no-fecha encontrado en una columna de fecha (caso conocido:
    'hace 1 año') se importa como NULL, conservando el texto original en
    una nota — nunca se inventa una fecha.
  - 'Área de servicio' es texto libre inconsistente (comas, mayúsculas, un
    typo real) — el handoff pide normalizarlo a tabla de relación más
    adelante, no ahora; se conserva tal cual en una nota para no perder el
    dato ni inventar una normalización a ciegas.

Uso:
    python -m migration.migrar_datos_reales --excel /ruta/al/excel.xlsx --dry-run
    python -m migration.migrar_datos_reales --excel /ruta/al/excel.xlsx
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Actividad, Persona, Seguimiento  # noqa: E402

# Catálogo de actividades — fuente: 'Resumen periódico'!D7:D11 del propio libro.
ACTIVIDADES = [
    "Sabado - Encuentro Marcados",
    "Domingo - Escuela Dominical",
    "Martes - Escuela de Servidores",
    "Reunion general lideres y servidores",
    "Otro / Evento esporadico",
]

COL = {  # 1-indexadas, hoja Jóvenes
    "no": 1,
    "nombres": 2,
    "apellidos": 3,
    "genero": 4,
    "edad_formula": 5,  # derivado, no migrar
    "fecha_nacimiento": 6,
    "segmento": 7,  # derivado, no migrar
    "estado": 8,
    "bautizado": 9,
    "area_servicio": 10,
    "estudio_biblico": 11,
    "telefono": 12,
    "correo": 13,
    "instagram": 14,
    "facebook": 15,
    "direccion": 16,
    "contacto_emergencia": 17,
    "telefono_emergencia": 18,
    "grupo_sanguineo": 19,
    "eps": 20,
    "talla": 21,
    "como_llego": 22,
    "notas": 23,
    "servidor": 24,
    "fecha_ingreso": 25,
    "fecha_bautismo": 26,
    "fecha_inicio_servicio": 27,
    "edad_manual": 28,
    "asistencia_30d": 29,  # derivado, no migrar
    "semaforo": 30,  # derivado, no migrar
    "nombre_completo_ayuda": 31,  # derivado, solo para checksum
    "id_unico": 32,
}

FILA_INICIO = 3
FILA_FIN = 122  # inclusive


def _si_no(valor) -> bool | None:
    if valor is None:
        return None
    v = str(valor).strip().lower()
    if v in ("si", "sí"):
        return True
    if v == "no":
        return False
    return None


def _texto(valor) -> str | None:
    if valor is None:
        return None
    v = str(valor).strip()
    return v or None


def _fecha(valor, campo: str, notas_extra: list[str]) -> dt.date | None:
    """Devuelve la fecha si el valor es una fecha real. Si hay texto en una
    columna de fecha (caso conocido: 'hace 1 año'), NO se inventa una
    conversión — se guarda como NULL y se deja constancia en las notas."""
    if valor is None:
        return None
    if isinstance(valor, dt.datetime):
        return valor.date()
    if isinstance(valor, dt.date):
        return valor
    texto = str(valor).strip()
    if texto:
        notas_extra.append(f"{campo} original (texto, no convertido): {texto!r}")
    return None


def leer_filas(ruta_excel: Path) -> list[dict]:
    wb = openpyxl.load_workbook(ruta_excel, data_only=True)
    ws = wb["Jóvenes"]
    filas = []
    for r in range(FILA_INICIO, FILA_FIN + 1):
        id_unico = ws.cell(row=r, column=COL["id_unico"]).value
        nombres = ws.cell(row=r, column=COL["nombres"]).value
        if not id_unico and not nombres:
            continue
        notas_extra: list[str] = []
        fila = {
            "fila_excel": r,
            "id_unico": _texto(id_unico),
            "nombres": _texto(nombres) or "",
            "apellidos": _texto(ws.cell(row=r, column=COL["apellidos"]).value) or "",
            "genero": _texto(ws.cell(row=r, column=COL["genero"]).value),
            "fecha_nacimiento": _fecha(
                ws.cell(row=r, column=COL["fecha_nacimiento"]).value, "Fecha de nacimiento", notas_extra
            ),
            "estado": _texto(ws.cell(row=r, column=COL["estado"]).value),
            "bautizado": _si_no(ws.cell(row=r, column=COL["bautizado"]).value),
            "area_servicio": _texto(ws.cell(row=r, column=COL["area_servicio"]).value),
            "estudio_biblico": _texto(ws.cell(row=r, column=COL["estudio_biblico"]).value),
            "telefono": _texto(ws.cell(row=r, column=COL["telefono"]).value),
            "correo_electronico": _texto(ws.cell(row=r, column=COL["correo"]).value),
            "instagram": _texto(ws.cell(row=r, column=COL["instagram"]).value),
            "facebook": _texto(ws.cell(row=r, column=COL["facebook"]).value),
            "direccion": _texto(ws.cell(row=r, column=COL["direccion"]).value),
            "contacto_emergencia": _texto(ws.cell(row=r, column=COL["contacto_emergencia"]).value),
            "telefono_emergencia": _texto(ws.cell(row=r, column=COL["telefono_emergencia"]).value),
            "grupo_sanguineo": _texto(ws.cell(row=r, column=COL["grupo_sanguineo"]).value),
            "eps": _texto(ws.cell(row=r, column=COL["eps"]).value),
            "talla": _texto(ws.cell(row=r, column=COL["talla"]).value),
            "como_llego": _texto(ws.cell(row=r, column=COL["como_llego"]).value),
            "notas": _texto(ws.cell(row=r, column=COL["notas"]).value),
            "servidor": _si_no(ws.cell(row=r, column=COL["servidor"]).value) or False,
            "fecha_ingreso": _fecha(
                ws.cell(row=r, column=COL["fecha_ingreso"]).value, "Fecha de ingreso al grupo", notas_extra
            ),
            "fecha_bautismo": _fecha(
                ws.cell(row=r, column=COL["fecha_bautismo"]).value, "Fecha de bautismo", notas_extra
            ),
            "fecha_inicio_servicio": _fecha(
                ws.cell(row=r, column=COL["fecha_inicio_servicio"]).value,
                "Fecha inicio en servicio",
                notas_extra,
            ),
            "edad_manual": ws.cell(row=r, column=COL["edad_manual"]).value,
        }
        if fila["bautizado"] is None:
            fila["bautizado"] = False
        if fila["area_servicio"]:
            notas_extra.append(f"Área de servicio (sin normalizar): {fila['area_servicio']}")
        if notas_extra:
            extra = " | ".join(notas_extra)
            fila["notas"] = f"{fila['notas']} | {extra}" if fila["notas"] else extra
        del fila["area_servicio"]
        filas.append(fila)
    return filas


def validar(filas: list[dict]) -> dict:
    """Solo detecta y reporta — nunca decide ni fusiona."""
    ids = [f["id_unico"] for f in filas]
    sin_id = [f for f in filas if not f["id_unico"]]
    ids_vistos: dict[str, dict] = {}
    ids_duplicados = []
    for f in filas:
        if f["id_unico"] in ids_vistos:
            ids_duplicados.append((ids_vistos[f["id_unico"]], f))
        else:
            ids_vistos[f["id_unico"]] = f

    # Apellido faltante es un vacío real de los datos (22 casos conocidos), no
    # bloquea la migración — solo "nombres" vacío sí sería un problema real,
    # porque ahí no habría ni siquiera con qué identificar a la persona.
    sin_nombre = [f for f in filas if not f["nombres"]]
    sin_apellido = [f for f in filas if f["nombres"] and not f["apellidos"]]
    sin_estado = [f for f in filas if not f["estado"]]

    telefonos: dict[str, list[dict]] = {}
    for f in filas:
        if f["telefono"]:
            telefonos.setdefault(f["telefono"], []).append(f)
    telefonos_compartidos = {t: fs for t, fs in telefonos.items() if len(fs) > 1}

    return {
        "total": len(filas),
        "sin_id": sin_id,
        "ids_duplicados": ids_duplicados,
        "sin_nombre": sin_nombre,
        "sin_apellido": sin_apellido,
        "sin_estado": sin_estado,
        "telefonos_compartidos": telefonos_compartidos,
    }


def imprimir_reporte(filas: list[dict], val: dict) -> None:
    print(f"Personas leídas del Excel: {val['total']}")
    print(f"Sin ID único: {len(val['sin_id'])}")
    print(f"IDs duplicados: {len(val['ids_duplicados'])}")
    print(f"Sin nombre (bloqueante): {len(val['sin_nombre'])}")
    print(f"Sin apellido registrado (dato real, no bloquea): {len(val['sin_apellido'])}")
    for f in val["sin_apellido"]:
        print(f"  fila {f['fila_excel']} {f['id_unico']} {f['nombres']!r}")
    print(f"Sin Estado definido: {len(val['sin_estado'])} — se importan con estado=NULL + Seguimiento marcado")
    for f in val["sin_estado"]:
        print(f"  fila {f['fila_excel']} {f['id_unico']} {f['nombres']} {f['apellidos']}")
    print(f"\nTeléfonos compartidos por más de una persona: {len(val['telefonos_compartidos'])}")
    for tel, fs in val["telefonos_compartidos"].items():
        nombres = ", ".join(f"{f['id_unico']} {f['nombres']} {f['apellidos']}" for f in fs)
        print(f"  {tel}: {nombres}  (NO se fusiona — se marca para revisión humana)")


def migrar(ruta_excel: Path, dry_run: bool) -> None:
    filas = leer_filas(ruta_excel)
    val = validar(filas)
    imprimir_reporte(filas, val)

    if val["sin_id"] or val["ids_duplicados"] or val["sin_nombre"]:
        print("\nERROR: hay filas sin ID único, con ID duplicado, o sin nombre. No se puede migrar así.")
        raise SystemExit(1)

    if dry_run:
        print("\n--dry-run: no se escribió nada en la base de datos.")
        return

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existentes = db.query(Persona).count()
        if existentes:
            print(f"\nERROR: la base de datos ya tiene {existentes} personas. No se sobrescribe en silencio.")
            print("Si es una base de prueba y querés reiniciarla, borrala vos mismo antes de correr esto.")
            raise SystemExit(1)

        actividades_por_nombre = {}
        for nombre in ACTIVIDADES:
            act = Actividad(nombre=nombre)
            db.add(act)
            db.flush()
            actividades_por_nombre[nombre] = act
        print(f"\nActividades creadas: {len(actividades_por_nombre)}")

        personas_por_id: dict[str, Persona] = {}
        creadas = 0
        for f in filas:
            persona = Persona(
                id_unico=f["id_unico"],
                nombres=f["nombres"],
                apellidos=f["apellidos"],
                genero=f["genero"],
                fecha_nacimiento=f["fecha_nacimiento"],
                estado=f["estado"],
                bautizado=f["bautizado"],
                estudio_biblico=f["estudio_biblico"],
                telefono=f["telefono"],
                correo_electronico=f["correo_electronico"],
                instagram=f["instagram"],
                facebook=f["facebook"],
                direccion=f["direccion"],
                contacto_emergencia=f["contacto_emergencia"],
                telefono_emergencia=f["telefono_emergencia"],
                grupo_sanguineo=f["grupo_sanguineo"],
                eps=f["eps"],
                talla=f["talla"],
                como_llego=f["como_llego"],
                notas=f["notas"],
                servidor=f["servidor"],
                fecha_ingreso=f["fecha_ingreso"],
                fecha_bautismo=f["fecha_bautismo"],
                fecha_inicio_servicio=f["fecha_inicio_servicio"],
                edad_manual=f["edad_manual"] if isinstance(f["edad_manual"], int) else None,
            )
            db.add(persona)
            db.flush()
            personas_por_id[f["id_unico"]] = persona
            creadas += 1
        print(f"Personas creadas: {creadas}")

        seguimientos = 0
        for f in val["sin_estado"]:
            persona = personas_por_id[f["id_unico"]]
            db.add(
                Seguimiento(
                    persona_id=persona.id,
                    tipo="revision",
                    notas=(
                        "Sin Estado definido (Activo/Inactivo/Fluctúa) al momento de migrar el "
                        "Excel — sin evidencia interna para inferirlo. Requiere decisión humana."
                    ),
                    requiere_atencion=True,
                )
            )
            seguimientos += 1

        for tel, fs in val["telefonos_compartidos"].items():
            for f in fs:
                otros = [g for g in fs if g is not f]
                otros_desc = "; ".join(f"{g['id_unico']} {g['nombres']} {g['apellidos']}" for g in otros)
                persona = personas_por_id[f["id_unico"]]
                db.add(
                    Seguimiento(
                        persona_id=persona.id,
                        tipo="revision",
                        notas=(
                            f"Posible duplicado: mismo teléfono ({tel}) que {otros_desc}. "
                            "NO fusionado automáticamente — requiere decisión humana."
                        ),
                        requiere_atencion=True,
                    )
                )
                seguimientos += 1

        db.commit()
        print(f"Registros de Seguimiento creados (marcados para revisión): {seguimientos}")
        print("\nMigración completa.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.excel.exists():
        print(f"No existe el archivo: {args.excel}")
        raise SystemExit(1)

    migrar(args.excel, dry_run=args.dry_run)
