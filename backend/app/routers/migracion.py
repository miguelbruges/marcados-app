from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import Usuario
from app.services.migracion_excel import (
    aplicar_importacion,
    cargar_workbook,
    comparar_importacion,
    hay_errores_bloqueantes,
    leer_catalogos,
    leer_filas,
)

router = APIRouter(prefix="/migracion", tags=["migracion"])


@router.post("/importar")
async def importar_excel(
    archivo: UploadFile,
    confirmar: bool = False,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    """Un solo flujo para el Excel (pedido del usuario, 2026-08-16): por ID
    único, crea a quien no existe todavía y actualiza (campo por campo,
    queda en Bitácora) a quien ya existe y cambió. Sirve tanto para la
    primera carga en una base vacía como para cualquier sincronización
    posterior — antes eran dos pantallas separadas ("Cargar datos
    iniciales", que se negaba si ya había personas, y "Actualizar desde
    Excel", que nunca creaba). Solo admin: son datos personales de menores
    de edad. Por defecto (confirmar=false) es una vista previa que no
    escribe nada; confirmar=true escribe de verdad."""
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
    comparacion = comparar_importacion(db, filas)
    comparacion["catalogos"] = {tipo: len(valores) for tipo, valores in catalogos.items()}

    if hay_errores_bloqueantes(comparacion):
        comparacion["error"] = (
            "Hay filas sin ID único, con ID duplicado, o sin nombre — no se puede importar así. "
            "Nada se escribió en la base."
        )
        return comparacion

    if not confirmar:
        comparacion["vista_previa"] = True
        hay_cambios = bool(comparacion["a_crear"] or comparacion["a_actualizar"])
        comparacion["mensaje"] = (
            "Vista previa: no se escribió nada. Confirmá para aplicar estos cambios."
            if hay_cambios
            else "No hay nada para crear ni actualizar — el Excel coincide con lo que ya hay en la base."
        )
        return comparacion

    resultado = aplicar_importacion(db, filas, catalogos, admin.id)
    comparacion["vista_previa"] = False
    comparacion["resultado"] = resultado
    comparacion["mensaje"] = f"Listo: {resultado['personas_creadas']} nuevas, {resultado['personas_actualizadas']} actualizadas."
    return comparacion
