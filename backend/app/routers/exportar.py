from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_admin
from app.models import Usuario
from app.services.exportador_excel import generar_export

router = APIRouter(prefix="/export", tags=["exportar"])


@router.get("/excel")
def exportar_excel(db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin)):
    """Exporta el estado actual a un .xlsx con el mismo diseño del libro
    real (sección 16.2 del handoff). Solo admin: son datos personales de
    menores de edad — mínimo acceso necesario por rol (sección 20)."""
    if not settings.excel_template_path:
        raise HTTPException(
            status_code=503, detail="No hay una plantilla de Excel configurada (EXCEL_TEMPLATE_PATH)"
        )
    ruta = Path(settings.excel_template_path)
    if not ruta.is_file():
        raise HTTPException(status_code=503, detail="La plantilla configurada no existe en el servidor")

    buffer = generar_export(db, ruta)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=MARCADOS_export.xlsx"},
    )
