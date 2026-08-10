"""CLI para la migración del Excel real de MARCADOS a la BD local.

La lógica de negocio vive en app/services/migracion_excel.py (compartida con
el endpoint de subida admin-only, ver app/routers/migracion.py) — este
script solo agrega el manejo de argumentos y el reporte por consola.

Uso:
    python -m migration.migrar_datos_reales --excel /ruta/al/excel.xlsx --dry-run
    python -m migration.migrar_datos_reales --excel /ruta/al/excel.xlsx
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Persona  # noqa: E402
from app.services.migracion_excel import (  # noqa: E402
    cargar_workbook,
    ejecutar_migracion,
    hay_errores_bloqueantes,
    imprimir_reporte,
    leer_catalogos,
    leer_filas,
    validar,
)


def migrar(ruta_excel: Path, dry_run: bool) -> None:
    wb = cargar_workbook(str(ruta_excel))
    filas = leer_filas(wb)
    val = validar(filas)
    catalogos = leer_catalogos(wb)
    imprimir_reporte(val, catalogos)

    if hay_errores_bloqueantes(val):
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

        resultado = ejecutar_migracion(db, filas, val, catalogos)
        print(f"\nValores de catálogo creados: {resultado['catalogos_creados']}")
        print(f"Actividades creadas: {resultado['actividades_creadas']}")
        print(f"Personas creadas: {resultado['personas_creadas']} (todas marcadas registro_historico=True)")
        print(f"Registros de Seguimiento creados (marcados para revisión): {resultado['seguimientos_creados']}")
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
