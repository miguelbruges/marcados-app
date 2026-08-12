import io
from datetime import datetime
from pathlib import Path

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_admin
from app.models import PlantillaExcel, Usuario
from app.services.exportador_excel import generar_export

router = APIRouter(prefix="/export", tags=["exportar"])


@router.get("/plantilla/estado")
def estado_plantilla(db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)):
    """Para que Administración pueda mostrar si ya hay plantilla subida o
    hace falta subir una, sin tener que intentar descargar para saber."""
    plantilla = db.query(PlantillaExcel).first()
    if plantilla:
        return {
            "configurada": True,
            "nombre_archivo": plantilla.nombre_archivo,
            "actualizado_en": plantilla.actualizado_en,
        }
    return {
        "configurada": bool(settings.excel_template_path and Path(settings.excel_template_path).is_file()),
        "nombre_archivo": None,
        "actualizado_en": None,
    }


@router.post("/plantilla", status_code=204)
async def subir_plantilla(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    """Sube (o reemplaza) el libro real usado como plantilla de exportación.
    Se guarda en la base — el disco de Render es efímero y no sobrevive a
    un redeploy, así que EXCEL_TEMPLATE_PATH solo no alcanza en producción."""
    if not archivo.filename or not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx o .xlsm")
    contenido = await archivo.read()
    try:
        openpyxl.load_workbook(io.BytesIO(contenido))
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo leer el archivo como un Excel válido")

    db.query(PlantillaExcel).delete()
    db.add(PlantillaExcel(nombre_archivo=archivo.filename, contenido=contenido, actualizado_en=datetime.utcnow()))
    db.commit()


@router.get("/excel")
def exportar_excel(db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)):
    """Exporta el estado actual a un .xlsx con el mismo diseño del libro
    real (sección 16.2 del handoff). Solo admin: son datos personales de
    menores de edad — mínimo acceso necesario por rol (sección 20)."""
    plantilla_guardada = db.query(PlantillaExcel).first()
    if plantilla_guardada:
        origen = io.BytesIO(plantilla_guardada.contenido)
    elif settings.excel_template_path and Path(settings.excel_template_path).is_file():
        origen = Path(settings.excel_template_path)
    else:
        raise HTTPException(
            status_code=503,
            detail="No hay una plantilla de Excel configurada. Subila desde Administración → Descargar Excel.",
        )

    buffer = generar_export(db, origen)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=MARCADOS_export.xlsx"},
    )
