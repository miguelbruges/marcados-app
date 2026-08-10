from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import Persona, Usuario
from app.services.migracion_excel import (
    cargar_workbook,
    ejecutar_migracion,
    hay_errores_bloqueantes,
    leer_catalogos,
    leer_filas,
    resumen_validacion,
    validar,
)

router = APIRouter(prefix="/migracion", tags=["migracion"])


@router.post("/excel")
async def migrar_excel(
    archivo: UploadFile,
    confirmar: bool = False,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    """Sube el Excel real y lo migra a la base de datos en vivo — mismo
    contrato que el script de línea de comandos (migration/migrar_datos_reales.py).
    Solo admin: es la carga inicial de datos personales de menores de edad.

    Por defecto (confirmar=false) es una vista previa: lee y valida, pero no
    escribe nada. Con confirmar=true escribe de verdad — y aun así se niega
    si la base ya tiene personas, para no sobrescribir en silencio."""
    if not archivo.filename or not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=422, detail="El archivo debe ser un .xlsx o .xlsm")

    try:
        wb = cargar_workbook(archivo.file)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el archivo como Excel: {e}")

    for hoja in ("Jóvenes", "Catálogos"):
        if hoja not in wb.sheetnames:
            raise HTTPException(status_code=422, detail=f"El archivo no tiene la hoja '{hoja}' esperada")

    filas = leer_filas(wb)
    catalogos = leer_catalogos(wb)
    val = validar(filas)
    reporte = resumen_validacion(val, catalogos)

    if hay_errores_bloqueantes(val):
        reporte["error"] = (
            "Hay filas sin ID único, con ID duplicado, o sin nombre — no se puede migrar así. "
            "Nada se escribió en la base."
        )
        return reporte

    if not confirmar:
        reporte["vista_previa"] = True
        reporte["mensaje"] = "Vista previa: no se escribió nada. Confirmá para migrar de verdad."
        return reporte

    existentes = db.query(Persona).count()
    if existentes:
        raise HTTPException(
            status_code=409,
            detail=f"La base de datos ya tiene {existentes} personas. No se sobrescribe en silencio.",
        )

    resultado = ejecutar_migracion(db, filas, val, catalogos)
    reporte["vista_previa"] = False
    reporte["resultado"] = resultado
    reporte["mensaje"] = "Migración completa."
    return reporte
